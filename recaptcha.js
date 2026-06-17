const axios = require('axios');

async function verifyRecaptcha(token, expectedAction = 'LOGIN') {
  if (!token) {
    console.log('No reCAPTCHA token provided');
    return { success: false, score: 0 };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  const apiKey = process.env.RECAPTCHA_API_KEY;
  const siteKey = process.env.RECAPTCHA_SITE_KEY;

  try {
    const url = `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`;
    const payload = {
      event: {
        token: token,
        siteKey: siteKey,
        expectedAction: expectedAction
      }
    };

    const response = await axios.post(url, payload);
    const data = response.data;
    console.log('reCAPTCHA response:', JSON.stringify(data, null, 2));
    
    if (data.tokenProperties && data.tokenProperties.valid) {
      return {
        success: true,
        score: data.riskAnalysis.score,
        reasons: data.riskAnalysis.reasons
      };
    } else {
      console.error('reCAPTCHA validation failed. Full response:', JSON.stringify(data, null, 2));
      return { success: false, score: 0 };
    }
  } catch (error) {
    console.error('Error verifying reCAPTCHA:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    return { success: false, score: 0 };
  }
}

module.exports = { verifyRecaptcha };
