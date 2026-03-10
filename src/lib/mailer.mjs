// src/lib/mailer.mjs
import Mailjet from 'node-mailjet';

const mj = Mailjet.apiConnect(
  process.env.MJ_APIKEY_PUBLIC,
  process.env.MJ_APIKEY_PRIVATE
);

const FROM_EMAIL = process.env.MJ_FROM_EMAIL || 'noreply@schedkit.net';
const FROM_NAME  = process.env.MJ_FROM_NAME  || 'SchedKit';

export async function sendBookingConfirmation({ attendee_name, attendee_email, host_name, host_email, event_title, start_time, timezone, cancel_url, reschedule_url, flag }) {
  const startLocal = new Date(start_time).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: timezone,
  });

  const flagColors = { caution: '#f5a623', high: '#ff5f5f', blocked: '#ff1744' };
  const flagLabels = {
    caution: '⚠️ CAUTION',
    high: '🚨 HIGH RISK — Get payment before the appointment',
    blocked: '🚫 BLOCKED CLIENT — Consider refusing this booking',
  };
  const flagBanner = flag && flag.risk_level !== 'ok' ? `
    <tr>
      <td style="padding:0 28px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:${flagColors[flag.risk_level] || '#f5a623'}22;border:1px solid ${flagColors[flag.risk_level] || '#f5a623'};border-radius:8px;">
          <tr><td style="padding:14px 18px;">
            <p style="margin:0;font-size:13px;font-weight:700;color:${flagColors[flag.risk_level] || '#f5a623'};font-family:monospace;">${flagLabels[flag.risk_level] || flag.risk_level.toUpperCase()}</p>
            ${flag.notes ? `<p style="margin:6px 0 0;font-size:12px;color:#e8e8ea;">${flag.notes}</p>` : ''}
          </td></tr>
        </table>
      </td>
    </tr>` : '';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:'Helvetica Neue',Arial,sans-serif;color:#e8e8ea;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111114;border:1px solid #1e1e24;border-radius:10px;overflow:hidden;">
        <tr>
          <td style="padding:12px 28px;background:#0a0a0b;border-bottom:1px solid #1e1e24;">
            <img src="https://schedkit.net/logo.png" width="32" height="32" alt="\\" style="display:block;border:0;">
          </td>
        </tr>
        <tr>
          <td style="padding:36px 28px 24px;">
            <p style="font-size:13px;color:#5a5a6e;margin:0 0 8px;">BOOKING CONFIRMED</p>
            <h1 style="margin:0 0 6px;font-size:22px;color:#e8e8ea;">${event_title}</h1>
            <p style="margin:0 0 28px;font-size:14px;color:#5a5a6e;">with ${host_name}</p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;border:1px solid #1e1e24;border-radius:8px;margin-bottom:28px;">
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #1e1e24;">
                  <p style="margin:0;font-size:11px;color:#5a5a6e;text-transform:uppercase;letter-spacing:0.05em;font-family:monospace;">Date & Time</p>
                  <p style="margin:6px 0 0;font-size:15px;font-family:monospace;color:#DFFF00;">${startLocal}</p>
                  <p style="margin:4px 0 0;font-size:12px;color:#5a5a6e;">${timezone}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0;font-size:11px;color:#5a5a6e;text-transform:uppercase;letter-spacing:0.05em;font-family:monospace;">Attendee</p>
                  <p style="margin:6px 0 0;font-size:14px;color:#e8e8ea;">${attendee_name}</p>
                  <p style="margin:2px 0 0;font-size:13px;color:#5a5a6e;">${attendee_email}</p>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 24px;font-size:13px;color:#5a5a6e;line-height:1.6;">
              Need to make a change?
              <a href="${reschedule_url || '#'}" style="color:#DFFF00;">Reschedule</a> &nbsp;·&nbsp;
              <a href="${cancel_url}" style="color:#5a5a6e;">Cancel this booking</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px;background:#0a0a0b;border-top:1px solid #1e1e24;">
            <img src="https://schedkit.net/logo.png" width="32" height="32" alt="\\" style="display:block;border:0;">
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await mj.post('send', { version: 'v3.1' }).request({
      Messages: [{
        From: { Email: FROM_EMAIL, Name: FROM_NAME },
        To: [{ Email: attendee_email, Name: attendee_name }],
        Subject: `Confirmed: ${event_title} with ${host_name}`,
        HTMLPart: html,
      }],
    });
    console.log(`Confirmation email sent to ${attendee_email}`);
  } catch(e) {
    console.error('Mailjet error:', e.message);
  }

  // Send host notification (with flag warning if applicable)
  if (host_email) {
    try {
      const hostHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0b;font-family:'Helvetica Neue',Arial,sans-serif;color:#e8e8ea;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111114;border:1px solid #1e1e24;border-radius:10px;overflow:hidden;">
        <tr><td style="padding:12px 28px;background:#0a0a0b;border-bottom:1px solid #1e1e24;">
          <img src="https://schedkit.net/logo.png" width="32" height="32" alt="\\" style="display:block;border:0;">
        </td></tr>
        ${flagBanner}
        <tr><td style="padding:28px 28px 24px;">
          <p style="font-size:13px;color:#5a5a6e;margin:0 0 8px;">NEW BOOKING</p>
          <h2 style="margin:0 0 20px;font-size:20px;color:#e8e8ea;">${event_title}</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;border:1px solid #1e1e24;border-radius:8px;">
            <tr><td style="padding:14px 18px;border-bottom:1px solid #1e1e24;">
              <p style="margin:0;font-size:11px;color:#5a5a6e;font-family:monospace;text-transform:uppercase;">Attendee</p>
              <p style="margin:6px 0 0;font-size:14px;color:#e8e8ea;">${attendee_name} &lt;${attendee_email}&gt;</p>
            </td></tr>
            <tr><td style="padding:14px 18px;">
              <p style="margin:0;font-size:11px;color:#5a5a6e;font-family:monospace;text-transform:uppercase;">When</p>
              <p style="margin:6px 0 0;font-size:14px;font-family:monospace;color:#DFFF00;">${startLocal}</p>
              <p style="margin:2px 0 0;font-size:12px;color:#5a5a6e;">${timezone}</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 28px 24px;">
          <a href="https://schedkit.net/dashboard" style="display:inline-block;background:#DFFF00;color:#0a0a0b;padding:12px 24px;border-radius:8px;font-weight:700;font-size:13px;text-decoration:none;">View in Dashboard →</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
      await mj.post('send', { version: 'v3.1' }).request({
        Messages: [{
          From: { Email: FROM_EMAIL, Name: FROM_NAME },
          To: [{ Email: host_email, Name: host_name }],
          Subject: `${flag && flag.risk_level !== 'ok' ? `⚠️ [${flag.risk_level.toUpperCase()}] ` : ''}New booking: ${attendee_name} — ${event_title}`,
          HTMLPart: hostHtml,
        }],
      });
      console.log(`Host notification sent to ${host_email}`);
    } catch(e) {
      console.error('Host notification email error:', e.message);
    }
  }
}

export async function sendAccessRequest({ name, email, company, message }) {
  try {
    await mj.post('send', { version: 'v3.1' }).request({
      Messages: [{
        From: { Email: FROM_EMAIL, Name: FROM_NAME },
        To: [{ Email: 'jrj@p7n.net', Name: 'Jason' }],
        ReplyTo: { Email: email, Name: name },
        Subject: `SchedKit Access Request: ${name}${company ? ' — ' + company : ''}`,
        TextPart: `Name: ${name}\nEmail: ${email}\nCompany: ${company || 'n/a'}\n\n${message || '(no message)'}`,
      }],
    });
    console.log(`Access request from ${email}`);
  } catch(e) {
    console.error('Mailjet error:', e.message);
    throw e;
  }
}

export async function sendInvite({ to, inviterName, orgName, link }) {
  try {
    await mj.post('send', { version: 'v3.1' }).request({
      Messages: [{
        From: { Email: FROM_EMAIL, Name: FROM_NAME },
        To: [{ Email: to }],
        Subject: `You've been invited to join ${orgName} on SchedKit`,
        TextPart: `Hi,\n\n${inviterName} has invited you to join ${orgName} on SchedKit.\n\nClick the link below to accept and set up your account:\n\n${link}\n\nThis link expires in 24 hours.\n\nIf you weren't expecting this, you can safely ignore it.`,
        HTMLPart: `<!DOCTYPE html><html><body style="background:#0a0a0b;color:#e8e8ea;font-family:sans-serif;padding:40px;max-width:500px;margin:0 auto">
<h2 style="color:#DFFF00;font-family:monospace">SchedKit</h2>
<p>Hi,</p>
<p><strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on SchedKit.</p>
<p>Click below to accept the invitation and set up your account. This link expires in <strong>24 hours</strong>.</p>
<a href="${link}" style="display:inline-block;background:#DFFF00;color:#0a0a0b;padding:14px 28px;border-radius:8px;font-weight:700;text-decoration:none;margin:20px 0">Accept Invitation →</a>
<p style="color:#5a5a6e;font-size:13px">Or copy this URL: ${link}</p>
<p style="color:#5a5a6e;font-size:12px">If you weren't expecting this, you can safely ignore it.</p>
</body></html>`,
      }],
    });
  } catch(e) {
    console.error('Invite email error:', e.message);
  }
}

export async function sendMagicLink({ to, name, link }) {
  try {
    await mj.post('send', { version: 'v3.1' }).request({
      Messages: [{
        From: { Email: FROM_EMAIL, Name: FROM_NAME },
        To: [{ Email: to, Name: name }],
        Subject: 'Your SchedKit login link',
        TextPart: `Hi ${name},\n\nClick this link to log in to your SchedKit dashboard:\n\n${link}\n\nThis link expires in 15 minutes and can only be used once.\n\nIf you didn't request this, you can safely ignore it.`,
        HTMLPart: `<!DOCTYPE html><html><body style="background:#0a0a0b;color:#e8e8ea;font-family:sans-serif;padding:40px;max-width:500px;margin:0 auto">
<h2 style="color:#DFFF00;font-family:monospace">SchedKit</h2>
<p>Hi ${name},</p>
<p>Click the button below to log in to your dashboard. This link expires in <strong>15 minutes</strong>.</p>
<a href="${link}" style="display:inline-block;background:#DFFF00;color:#0a0a0b;padding:14px 28px;border-radius:8px;font-weight:700;text-decoration:none;margin:20px 0">Log in to Dashboard →</a>
<p style="color:#5a5a6e;font-size:13px">Or copy this URL: ${link}</p>
<p style="color:#5a5a6e;font-size:12px">If you didn't request this, ignore this email.</p>
</body></html>`,
      }],
    });
  } catch(e) {
    console.error('Magic link email error:', e.message);
    throw e;
  }
}

export async function sendRescheduleNotification({ attendee_name, attendee_email, host_name, event_title, old_time, new_time, timezone, cancel_url, reschedule_url, appointment_label }) {
  const label = appointment_label || 'meeting';
  const oldLocal = new Date(old_time).toLocaleString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone: timezone });
  const newLocal = new Date(new_time).toLocaleString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone: timezone });

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0b;font-family:'Helvetica Neue',Arial,sans-serif;color:#e8e8ea;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111114;border:1px solid #1e1e24;border-radius:10px;overflow:hidden;">
        <tr><td style="padding:12px 28px;background:#0a0a0b;border-bottom:1px solid #1e1e24;">
          <img src="https://schedkit.net/logo.png" width="32" height="32" alt="\\" style="display:block;border:0;">
        </td></tr>
        <tr><td style="padding:36px 28px 24px;">
          <p style="font-size:13px;color:#5a5a6e;margin:0 0 8px;text-transform:uppercase;letter-spacing:.05em;">Your ${label} has been rescheduled</p>
          <h1 style="margin:0 0 6px;font-size:22px;color:#e8e8ea;">${event_title}</h1>
          <p style="margin:0 0 28px;font-size:14px;color:#5a5a6e;">with ${host_name}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;border:1px solid #1e1e24;border-radius:8px;margin-bottom:28px;">
            <tr><td style="padding:16px 20px;border-bottom:1px solid #1e1e24;">
              <p style="margin:0;font-size:11px;color:#5a5a6e;text-transform:uppercase;letter-spacing:0.05em;font-family:monospace;">Previous time</p>
              <p style="margin:6px 0 0;font-size:14px;color:#5a5a6e;text-decoration:line-through;font-family:monospace;">${oldLocal}</p>
            </td></tr>
            <tr><td style="padding:16px 20px;">
              <p style="margin:0;font-size:11px;color:#5a5a6e;text-transform:uppercase;letter-spacing:0.05em;font-family:monospace;">New time</p>
              <p style="margin:6px 0 0;font-size:15px;font-family:monospace;color:#DFFF00;">${newLocal}</p>
              <p style="margin:4px 0 0;font-size:12px;color:#5a5a6e;">${timezone}</p>
            </td></tr>
          </table>
          <p style="margin:0 0 24px;font-size:13px;color:#5a5a6e;line-height:1.6;">
            Need to make another change?
            <a href="${reschedule_url || '#'}" style="color:#DFFF00;">Reschedule again</a> &nbsp;·&nbsp;
            <a href="${cancel_url}" style="color:#5a5a6e;">Cancel this booking</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#0a0a0b;border-top:1px solid #1e1e24;">
          <img src="https://schedkit.net/logo.png" width="32" height="32" alt="\\" style="display:block;border:0;">
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    await mj.post('send', { version: 'v3.1' }).request({
      Messages: [{
        From: { Email: FROM_EMAIL, Name: FROM_NAME },
        To: [{ Email: attendee_email, Name: attendee_name }],
        Subject: `Rescheduled: ${event_title} with ${host_name}`,
        HTMLPart: html,
      }],
    });
    console.log(`Reschedule notification sent to ${attendee_email}`);
  } catch(e) {
    console.error('Mailjet error:', e.message);
  }
}

export async function sendCancellationEmail({ attendee_name, attendee_email, host_name, event_title, start_time, timezone, appointment_label }) {
  const label = appointment_label || 'meeting';
  const startLocal = new Date(start_time).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: timezone,
  });

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0b;font-family:'Helvetica Neue',Arial,sans-serif;color:#e8e8ea;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111114;border:1px solid #1e1e24;border-radius:10px;overflow:hidden;">
        <tr><td style="padding:12px 28px;background:#0a0a0b;border-bottom:1px solid #1e1e24;">
          <img src="https://schedkit.net/logo.png" width="32" height="32" alt="\\" style="display:block;border:0;">
        </td></tr>
        <tr><td style="padding:36px 28px 24px;">
          <p style="font-size:13px;color:#ff5f5f;margin:0 0 8px;text-transform:uppercase;letter-spacing:.05em;">Your ${label} has been cancelled</p>
          <h1 style="margin:0 0 6px;font-size:22px;color:#e8e8ea;">${event_title}</h1>
          <p style="margin:0 0 28px;font-size:14px;color:#5a5a6e;">with ${host_name}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;border:1px solid #1e1e24;border-radius:8px;margin-bottom:28px;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0;font-size:11px;color:#5a5a6e;text-transform:uppercase;letter-spacing:0.05em;font-family:monospace;">Cancelled time</p>
              <p style="margin:6px 0 0;font-size:15px;font-family:monospace;color:#5a5a6e;text-decoration:line-through;">${startLocal}</p>
              <p style="margin:4px 0 0;font-size:12px;color:#5a5a6e;">${timezone}</p>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;color:#5a5a6e;line-height:1.6;">If you'd like to rebook, please reach out to ${host_name} directly.</p>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#0a0a0b;border-top:1px solid #1e1e24;">
          <img src="https://schedkit.net/logo.png" width="32" height="32" alt="\\" style="display:block;border:0;">
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    await mj.post('send', { version: 'v3.1' }).request({
      Messages: [{
        From: { Email: FROM_EMAIL, Name: FROM_NAME },
        To: [{ Email: attendee_email, Name: attendee_name }],
        Subject: `Cancelled: ${event_title} with ${host_name}`,
        HTMLPart: html,
      }],
    });
    console.log(`Cancellation email sent to ${attendee_email}`);
  } catch(e) {
    console.error('Mailjet cancel email error:', e.message);
  }
}


// ── Shared email chrome ───────────────────────────────────────────────────────
const LOGO_HEADER = `
  <tr>
    <td style="padding:12px 28px;background:#0a0a0b;border-bottom:1px solid #1e1e24;">
      <img src="https://schedkit.net/logo.png" width="32" height="32" alt="SchedKit" style="display:block;border:0;">
    </td>
  </tr>`;

const LOGO_FOOTER = `
  <tr>
    <td style="padding:16px 28px;text-align:center;font-size:12px;color:#5a5a6e;border-top:1px solid #1e1e24;">
      <a href="https://schedkit.net" style="color:#5a5a6e;text-decoration:none;">schedkit.net</a>
    </td>
  </tr>`;

function emailWrap(bodyRows) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:'Helvetica Neue',Arial,sans-serif;color:#e8e8ea;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#111114;border:1px solid #1e1e24;border-radius:10px;overflow:hidden;">
        ${LOGO_HEADER}
        <tr><td style="padding:36px 28px 28px;">
          ${bodyRows}
        </td></tr>
        ${LOGO_FOOTER}
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function detailTable(rows) {
  const cells = rows.map(([label, value], i) => `
    <tr>
      <td style="padding:12px 20px;${i < rows.length-1 ? 'border-bottom:1px solid #1e1e24;' : ''}font-size:13px;color:#5a5a6e;">${label}</td>
      <td style="padding:12px 20px;${i < rows.length-1 ? 'border-bottom:1px solid #1e1e24;' : ''}font-size:13px;color:#e8e8ea;text-align:right;">${value}</td>
    </tr>`).join('');
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;border:1px solid #1e1e24;border-radius:8px;margin-bottom:28px;">${cells}</table>`;
}

// ── Pending booking — sent to attendee when requires_confirmation=true ──────
export async function sendBookingPending({ attendee_name, attendee_email, host_name, event_title, start_time, timezone }) {
  const startLocal = new Date(start_time).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: timezone,
  });
  const html = emailWrap(`
    <p style="margin:0 0 16px;font-size:11px;font-family:monospace;color:#DFFF00;letter-spacing:0.08em;">⏳ AWAITING CONFIRMATION</p>
    <h1 style="margin:0 0 6px;font-size:22px;color:#e8e8ea;">Your booking request was received</h1>
    <p style="margin:0 0 28px;font-size:14px;color:#5a5a6e;">${host_name} will review and confirm your booking shortly.</p>
    ${detailTable([
      ['Event', event_title],
      ['With', host_name],
      ['Requested time', startLocal],
    ])}
    <p style="margin:0;font-size:14px;color:#5a5a6e;line-height:1.6;">You'll receive a confirmation email once ${host_name} accepts your booking. No action needed from you right now.</p>
  `);
  try {
    await mj.post('send', { version: 'v3.1' }).request({
      Messages: [{
        From: { Email: FROM_EMAIL, Name: FROM_NAME },
        To: [{ Email: attendee_email, Name: attendee_name }],
        Subject: `Booking request received: ${event_title} with ${host_name}`,
        HTMLPart: html,
      }],
    });
  } catch(e) { console.error('Mailjet pending email error:', e.message); }
}

// ── Host notification — sent to host when a pending booking needs action ────
export async function sendHostConfirmationRequest({ host_name, host_email, attendee_name, attendee_email, event_title, start_time, timezone, notes, confirm_url, decline_url }) {
  const startLocal = new Date(start_time).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: timezone,
  });
  const noteRow = notes ? [['Notes', notes]] : [];
  const html = emailWrap(`
    <p style="margin:0 0 16px;font-size:11px;font-family:monospace;color:#DFFF00;letter-spacing:0.08em;">NEW BOOKING REQUEST</p>
    <h1 style="margin:0 0 6px;font-size:22px;color:#e8e8ea;">New booking request</h1>
    <p style="margin:0 0 28px;font-size:14px;color:#5a5a6e;">${attendee_name} wants to book time with you.</p>
    ${detailTable([
      ['Name', attendee_name],
      ['Email', `<a href="mailto:${attendee_email}" style="color:#e8e8ea;text-decoration:none;">${attendee_email}</a>`],
      ['Event', event_title],
      ['Requested time', startLocal],
      ...noteRow,
    ])}
    <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding-right:12px;">
          <a href="${confirm_url}" style="display:inline-block;background:#DFFF00;color:#0a0a0b;padding:13px 28px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;">✓ Confirm booking</a>
        </td>
        <td>
          <a href="${decline_url}" style="display:inline-block;background:#1a1a1f;color:#e8e8ea;padding:13px 28px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;border:1px solid #2e2e3a;">✕ Decline</a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-size:12px;color:#5a5a6e;">These links are single-use. No login required.</p>
  `);
  try {
    await mj.post('send', { version: 'v3.1' }).request({
      Messages: [{
        From: { Email: FROM_EMAIL, Name: FROM_NAME },
        To: [{ Email: host_email, Name: host_name }],
        Subject: `New booking request: ${attendee_name} — ${event_title}`,
        HTMLPart: html,
      }],
    });
  } catch(e) { console.error('Mailjet host confirmation request error:', e.message); }
}

// ── Booking confirmed — sent to attendee after host accepts ─────────────────
export async function sendBookingConfirmedByHost({ attendee_name, attendee_email, host_name, event_title, start_time, timezone, cancel_url, reschedule_url }) {
  const startLocal = new Date(start_time).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: timezone,
  });
  const html = emailWrap(`
    <p style="margin:0 0 16px;font-size:11px;font-family:monospace;color:#4ade80;letter-spacing:0.08em;">✓ CONFIRMED</p>
    <h1 style="margin:0 0 6px;font-size:22px;color:#e8e8ea;">Your booking is confirmed</h1>
    <p style="margin:0 0 28px;font-size:14px;color:#5a5a6e;">${host_name} has accepted your booking request.</p>
    ${detailTable([
      ['Event', event_title],
      ['With', host_name],
      ['When', `<span style="font-family:monospace;color:#DFFF00;">${startLocal}</span>`],
      ['Timezone', timezone],
    ])}
    <a href="${cancel_url}" style="display:inline-block;background:#1a1a1f;color:#e8e8ea;padding:11px 22px;border-radius:8px;font-size:13px;text-decoration:none;border:1px solid #2e2e3a;margin-right:8px;">Cancel booking</a>
    <a href="${reschedule_url}" style="display:inline-block;background:#1a1a1f;color:#e8e8ea;padding:11px 22px;border-radius:8px;font-size:13px;text-decoration:none;border:1px solid #2e2e3a;">Reschedule</a>
  `);
  try {
    await mj.post('send', { version: 'v3.1' }).request({
      Messages: [{
        From: { Email: FROM_EMAIL, Name: FROM_NAME },
        To: [{ Email: attendee_email, Name: attendee_name }],
        Subject: `Confirmed: ${event_title} with ${host_name}`,
        HTMLPart: html,
      }],
    });
  } catch(e) { console.error('Mailjet confirmed-by-host email error:', e.message); }
}

// ── Booking declined — sent to attendee after host declines ─────────────────
export async function sendBookingDeclined({ attendee_name, attendee_email, host_name, event_title, start_time, timezone }) {
  const startLocal = new Date(start_time).toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: timezone,
  });
  const html = emailWrap(`
    <p style="margin:0 0 16px;font-size:11px;font-family:monospace;color:#ff5f5f;letter-spacing:0.08em;">✕ DECLINED</p>
    <h1 style="margin:0 0 6px;font-size:22px;color:#e8e8ea;">Booking request declined</h1>
    <p style="margin:0 0 28px;font-size:14px;color:#5a5a6e;">${host_name} was unable to accept your booking request.</p>
    ${detailTable([
      ['Event', event_title],
      ['With', host_name],
      ['Requested time', startLocal],
    ])}
    <p style="margin:0;font-size:14px;color:#5a5a6e;line-height:1.6;">If you'd like to try a different time, visit the booking page to make a new request.</p>
  `);
  try {
    await mj.post('send', { version: 'v3.1' }).request({
      Messages: [{
        From: { Email: FROM_EMAIL, Name: FROM_NAME },
        To: [{ Email: attendee_email, Name: attendee_name }],
        Subject: `Booking declined: ${event_title} with ${host_name}`,
        HTMLPart: html,
      }],
    });
  } catch(e) { console.error('Mailjet declined email error:', e.message); }
}
