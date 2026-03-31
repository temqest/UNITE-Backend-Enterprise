const nodemailer = require('nodemailer');
require('dotenv').config();

async function testBrevoConnection() {
  console.log('🔍 Testing Brevo SMTP Configuration...\n');

  // Load config
  const config = {
    host: process.env.BREVO_SMPT_Server || process.env.BREVO_SMTP || 'smtp-relay.brevo.com',
    port: Number(process.env.BREVO_SMPT_Port || 587),
    secure: Number(process.env.BREVO_SMPT_Port || 587) === 465,
    auth: {
      user: process.env.BREVO_SMPT_Login || '',
      pass: process.env.BREVO_SMPT_Password || process.env.BREVO_SMPT_KEY || '',
    },
  };

  console.log('📋 Configuration:');
  console.log(`  Host: ${config.host}`);
  console.log(`  Port: ${config.port}`);
  console.log(`  Secure: ${config.secure}`);
  console.log(`  User: ${config.auth.user}`);
  console.log(`  Password: ${config.auth.pass ? '***SET***' : '❌ MISSING'}\n`);

  // Validate
  if (!config.auth.user) {
    console.error('❌ Missing BREVO_SMPT_Login');
    process.exit(1);
  }
  if (!config.auth.pass) {
    console.error('❌ Missing BREVO_SMPT_Password or BREVO_SMPT_KEY');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport(config);

  try {
    console.log('⏳ Verifying SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP Connection Successful!\n');

    console.log('📧 Sending test email...');
    const info = await transporter.sendMail({
      from: `"UNITE Health" <${process.env.BREVO_SMPT_Login || 'noreply@unitehealth.tech'}>`,
      to: process.env.BREVO_SMPT_Login || 'test@example.com',
      subject: 'UNITE Health - OTP Test Email',
      html: `
        <h2>Test OTP: 123456</h2>
        <p>If you received this email, Brevo SMTP is working correctly!</p>
      `,
      text: 'Test OTP: 123456\n\nIf you received this email, Brevo SMTP is working correctly!',
    });

    console.log('✅ Email sent successfully!');
    console.log(`  Message ID: ${info.messageId}`);
    console.log(`  Status: ${info.response}\n`);

    console.log('🎉 All systems operational! Resend OTP should work.');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n📌 Common issues:');
    console.error('  - Invalid BREVO_SMPT_Login or BREVO_SMPT_Password');
    console.error('  - SMTP server not accessible (firewall/network)');
    console.error('  - Port 587 blocked');
    process.exit(1);
  }

  process.exit(0);
}

testBrevoConnection();
