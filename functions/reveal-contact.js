// ============================================================
//  COLMENA HUB — functions/reveal-contact.js
//  Agregar al functions/index.js que ya tienes.
//
//  Hace dos cosas:
//  1. revealContact — el cliente llama esto para pedir el
//     teléfono del profesional. Solo funciona si faltan < 2h.
//  2. sendAppointmentReminders — cron cada hora que envía
//     notificaciones push cuando quedan 2h para la cita.
// ============================================================

const { onCall }   = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin          = require('firebase-admin');

// admin ya se inicializa en index.js — no repetir aquí
const db = admin.firestore();

// ── 1. Revelar datos de contacto ──────────────────────────
// El cliente llama: await firebase.functions().httpsCallable('revealContact')({ appointmentId })
exports.revealContact = onCall(async (request) => {
  if (!request.auth) throw new Error('No autenticado');

  const { appointmentId } = request.data;
  if (!appointmentId) throw new Error('Falta appointmentId');

  // Leer la cita
  const apptDoc = await db.collection('appointments').doc(appointmentId).get();
  if (!apptDoc.exists) throw new Error('Cita no encontrada');

  const appt = apptDoc.data();

  // Solo el cliente de la cita puede pedir el teléfono
  if (appt.clientId !== request.auth.uid) {
    throw new Error('No tienes permiso para ver esta información');
  }

  // La cita debe estar confirmada y pagada
  if (appt.status !== 'confirmed' || appt.paymentStatus !== 'paid') {
    throw new Error('La cita no está confirmada y pagada');
  }

  // Verificar que falten menos de 2 horas
  const now       = new Date();
  const startTime = appt.startTime.toDate();
  const diffHours = (startTime - now) / 3600000;

  if (diffHours > 2) {
    const hoursLeft = Math.ceil(diffHours - 2);
    return {
      revealed: false,
      message:  `El contacto se revelará en ${hoursLeft} hora${hoursLeft !== 1 ? 's' : ''} más.`,
      revealAt: new Date(startTime.getTime() - 2 * 3600000).toISOString()
    };
  }

  if (diffHours < -1) {
    return { revealed: false, message: 'La cita ya pasó.' };
  }

  // Leer teléfono del profesional (colección protegida)
  const profDoc = await db.collection('professionals').doc(appt.professionalId).get();
  if (!profDoc.exists) throw new Error('Profesional no encontrado');

  const profData = profDoc.data();

  // Registrar que se reveló (para auditoría)
  await db.collection('appointments').doc(appointmentId).update({
    contactRevealedAt: admin.firestore.FieldValue.serverTimestamp(),
    contactRevealedBy: request.auth.uid
  });

  return {
    revealed: true,
    phone:    profData.phone    || null,
    whatsapp: profData.phone    ? `https://wa.me/52${profData.phone.replace(/\D/g,'')}` : null,
    email:    profData.email    || null,
    message:  '¡Tu cita es pronto! Aquí están los datos de contacto del profesional.'
  };
});

// ── 2. Cron: enviar notificaciones 2h antes ───────────────
// Se ejecuta cada hora — revisa citas que empiezan entre 1h y 3h
exports.sendAppointmentReminders = onSchedule('every 60 minutes', async () => {
  const now    = new Date();
  const in1h   = new Date(now.getTime() + 1 * 3600000);
  const in3h   = new Date(now.getTime() + 3 * 3600000);

  const snap = await db.collection('appointments')
    .where('status', '==', 'confirmed')
    .where('startTime', '>=', admin.firestore.Timestamp.fromDate(in1h))
    .where('startTime', '<=', admin.firestore.Timestamp.fromDate(in3h))
    .where('reminderSent', '==', false)
    .get();

  if (snap.empty) {
    console.log('No hay citas próximas para recordar');
    return;
  }

  const batch = db.batch();

  for (const doc of snap.docs) {
    const appt = doc.data();

    // Marcar como recordatorio enviado (evita duplicados)
    batch.update(doc.ref, {
      reminderSent: true,
      reminderSentAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Crear notificación en Firestore para el cliente
    const clientNotifRef = db.collection('notifications').doc();
    batch.set(clientNotifRef, {
      userId:    appt.clientId,
      type:      'appointment_reminder',
      title:     '⏰ Tu cita es en 2 horas',
      body:      `Tienes una cita con ${appt.professionalName}. Ya puedes ver su número de contacto.`,
      appointmentId: doc.id,
      read:      false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Crear notificación para el profesional
    const profNotifRef = db.collection('notifications').doc();
    batch.set(profNotifRef, {
      userId:    appt.professionalId,
      type:      'appointment_reminder',
      title:     '⏰ Tienes una cita en 2 horas',
      body:      `Cita con ${appt.clientName} a las ${appt.startTime.toDate().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}.`,
      appointmentId: doc.id,
      read:      false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`Recordatorio enviado para cita ${doc.id}`);
  }

  await batch.commit();
  console.log(`${snap.size} recordatorios procesados`);
});