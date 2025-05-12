require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// 2C2P Configuration
const MERCHANT_ID = 'JT01';
const SECRET_KEY = 'ECC4E54DBA738857B84A7EBC6B5DC7187B8DA68750E88AB53AAA41F548D6F2D9';
const PAYMENT_TOKEN_API_URL = 'https://sandbox-pgw.2c2p.com/payment/4.3/paymentToken';
const PAYMENT_INQUIRY_API_URL = 'https://sandbox-pgw.2c2p.com/payment/4.3/paymentInquiry';

// Create payment endpoint
app.post('/api/create-payment', async (req, res) => {
  try {
    const { amount, currency } = req.body;
    
    // Generate unique invoice number
    const invoiceNo = 'INV' + Date.now();
    
    // Prepare JWT payload
    const payload = {
      merchantID: MERCHANT_ID,
      invoiceNo: invoiceNo,
      description: "item 1",
      amount: parseFloat(amount),
      currencyCode: currency,
      paymentChannel: ["CC"],
      request3DS: "",
      tokenize: false,
      cardTokens: [],
      cardTokenOnly: false,
      tokenizeOnly: false,
      interestType: "",
      installmentPeriodFilter: [],
      productCode: "",
      recurring: false,
      invoicePrefix: "",
      recurringAmount: 0,
      allowAccumulate: false,
      maxAccumulateAmount: 0,
      recurringInterval: 0,
      recurringCount: 0,
      chargeNextDate: "",
      chargeOnDate: "",
      paymentExpiry: "",
      promotionCode: "",
      paymentRouteID: "",
      fxProviderCode: "",
      immediatePayment: false,
      userDefined1: "",
      userDefined2: "",
      userDefined3: "",
      userDefined4: "",
      userDefined5: "",
      statementDescriptor: "",
      subMerchants: [],
      locale: "en",
      frontendReturnUrl: "http://localhost:5000/api/payment-frontend-callback",
      backendReturnUrl: "http://localhost:5000/api/payment-callback",
      nonceStr: crypto.randomBytes(32).toString('hex'),
      uiParams: {
        userInfo: {
          name: "Test User",
          email: "test@example.com",
          mobileNo: "88888888",
          countryCode: "SG",
          mobileNoPrefix: "65",
          currencyCode: currency
        }
      }
    };

    // Generate JWT token
    const token = jwt.sign(payload, SECRET_KEY, { algorithm: 'HS256' });

    // Prepare request to 2C2P
    const requestData = {
      payload: token
    };

    console.log('Sending payment token request:', JSON.stringify(requestData, null, 2));

    // Make request to 2C2P Payment Token API
    const response = await axios({
      method: 'post',
      url: PAYMENT_TOKEN_API_URL,
      data: requestData,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    console.log('Payment token response:', JSON.stringify(response.data, null, 2));

    // Decode the response payload
    const responsePayload = jwt.decode(response.data.payload);
    console.log('Decoded response payload:', JSON.stringify(responsePayload, null, 2));

    if (responsePayload.respCode !== '0000') {
      throw new Error(`Payment token request failed: ${responsePayload.respDesc}`);
    }

    // Return payment URL, token, and invoiceNo
    res.json({
      paymentUrl: responsePayload.webPaymentUrl,
      paymentToken: responsePayload.paymentToken,
      invoiceNo
    });

  } catch (error) {
    console.error('Payment creation error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to create payment',
      details: error.response?.data || error.message 
    });
  }
});

// Payment callback endpoint (Backend API)
app.post('/api/payment-callback', async (req, res) => {
  try {
    const {
      merchantID,
      invoiceNo,
      accountNo,
      amount,
      currencyCode,
      tranRef,
      referenceNo,
      approvalCode,
      eci,
      transactionDateTime,
      respCode,
      respDesc
    } = req.body;

    // Log the payment result
    console.log('Payment Result (Backend):', {
      merchantID,
      invoiceNo,
      accountNo,
      amount,
      currencyCode,
      tranRef,
      referenceNo,
      approvalCode,
      eci,
      transactionDateTime,
      respCode,
      respDesc
    });

    // If respCode is not 0000, we need to do a payment inquiry
    if (respCode !== '0000') {
      console.log('Payment inquiry needed for invoice:', invoiceNo);
      const inquiryResult = await performPaymentInquiry(invoiceNo);
      console.log('Payment inquiry result:', inquiryResult);
    }

    // Always return success to 2C2P
    res.json({ status: 'success' });
  } catch (error) {
    console.error('Payment callback error:', error);
    // Still return success to 2C2P even if we have an error
    res.json({ status: 'success' });
  }
});

// Payment inquiry endpoint
app.post('/api/payment-inquiry', async (req, res) => {
  try {
    const { invoiceNo } = req.body;

    if (!invoiceNo) {
      return res.status(400).json({ 
        error: 'Invoice number is required',
        respCode: '9999',
        respDesc: 'Invalid request - missing invoice number'
      });
    }

    const inquiryResult = await performPaymentInquiry(invoiceNo);
    res.json(inquiryResult);
  } catch (error) {
    console.error('Payment inquiry error:', error);
    res.status(500).json({ 
      error: 'Failed to process payment inquiry',
      respCode: '9999',
      respDesc: 'Internal server error'
    });
  }
});

// Helper function to perform payment inquiry
async function performPaymentInquiry(invoiceNo) {
  try {
    // Prepare JWT payload for payment inquiry
    const payload = {
      merchantID: MERCHANT_ID,
      invoiceNo: invoiceNo,
      locale: "en"
    };

    // Generate JWT token
    const token = jwt.sign(payload, SECRET_KEY, { algorithm: 'HS256' });

    // Prepare request to 2C2P
    const requestData = {
      payload: token
    };

    console.log('Sending payment inquiry request:', JSON.stringify(requestData, null, 2));

    // Make request to 2C2P Payment Inquiry API
    const response = await axios({
      method: 'post',
      url: PAYMENT_INQUIRY_API_URL,
      data: requestData,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    console.log('Payment inquiry response:', JSON.stringify(response.data, null, 2));

    // Decode the response payload
    const responsePayload = jwt.decode(response.data.payload);
    console.log('Decoded inquiry response payload:', JSON.stringify(responsePayload, null, 2));

    return responsePayload;
  } catch (error) {
    console.error('Payment inquiry error:', error);
    throw error;
  }
}

// Update frontend callback endpoint
app.get('/api/payment-frontend-callback', async (req, res) => {
  try {
    // Get parameters from query string
    const {
      invoiceNo,
      channelCode,
      respCode,
      respDesc
    } = req.query;

    // Log the frontend callback
    console.log('Frontend Callback Received (GET):', {
      invoiceNo,
      channelCode,
      respCode,
      respDesc
    });

    // If respCode is 2000, we need to do a payment inquiry
    if (respCode === '2000') {
      const inquiryResult = await performPaymentInquiry(invoiceNo);
      console.log('Payment inquiry result:', inquiryResult);

      // Handle specific error codes
      let errorMessage = inquiryResult.respDesc;
      let errorDetails = '';
      let isSuccess = false;
      
      // Check for success codes
      if (inquiryResult.respCode === '0000') {
        isSuccess = true;
        errorMessage = 'Transaction successful';
      } else {
        switch (inquiryResult.respCode) {
          case '4099':
            errorMessage = 'Transaction failed. Please try again.';
            errorDetails = 'This could be due to insufficient funds, card restrictions, or bank rejection.';
            break;
          default:
            errorMessage = `Transaction failed: ${inquiryResult.respDesc}`;
            errorDetails = 'Please try again or contact support if the issue persists.';
        }
      }

      // Redirect to frontend with payment result
      const redirectUrl = new URL('http://localhost:3000/payment-result');
      redirectUrl.searchParams.append('invoiceNo', inquiryResult.invoiceNo || '');
      redirectUrl.searchParams.append('amount', inquiryResult.amount || '');
      redirectUrl.searchParams.append('currencyCode', inquiryResult.currencyCode || '');
      redirectUrl.searchParams.append('respCode', inquiryResult.respCode || '');
      redirectUrl.searchParams.append('respDesc', errorMessage);
      redirectUrl.searchParams.append('isSuccess', isSuccess.toString());
      if (errorDetails) {
        redirectUrl.searchParams.append('errorDetails', errorDetails);
      }

      console.log('Redirecting to:', redirectUrl.toString());
      res.redirect(redirectUrl.toString());
    } else {
      // Handle other response codes directly
      const redirectUrl = new URL('http://localhost:3000/payment-result');
      redirectUrl.searchParams.append('invoiceNo', invoiceNo || '');
      redirectUrl.searchParams.append('respCode', respCode || '');
      redirectUrl.searchParams.append('respDesc', respDesc || '');
      redirectUrl.searchParams.append('isSuccess', (respCode === '0000').toString());

      console.log('Redirecting to:', redirectUrl.toString());
      res.redirect(redirectUrl.toString());
    }
  } catch (error) {
    console.error('Frontend callback error:', error);
    res.redirect('http://localhost:3000/payment-result?respCode=9999&respDesc=Error processing payment&errorDetails=An unexpected error occurred. Please try again.&isSuccess=false');
  }
});

// Keep the POST endpoint for backward compatibility
app.post('/api/payment-frontend-callback', async (req, res) => {
  try {
    // Log the entire request body for debugging
    console.log('Frontend Callback Request Body (POST):', req.body);

    const {
      invoiceNo,
      channelCode,
      respCode,
      respDesc
    } = req.body;

    // Log the frontend callback
    console.log('Frontend Callback Received (POST):', {
      invoiceNo,
      channelCode,
      respCode,
      respDesc
    });

    // If respCode is 2000, we need to do a payment inquiry
    if (respCode === '2000') {
      const inquiryResult = await performPaymentInquiry(invoiceNo);
      console.log('Payment inquiry result:', inquiryResult);

      // Handle specific error codes
      let errorMessage = inquiryResult.respDesc;
      let errorDetails = '';
      let isSuccess = false;
      
      // Check for success codes
      if (inquiryResult.respCode === '0000') {
        isSuccess = true;
        errorMessage = 'Transaction successful';
      } else {
        switch (inquiryResult.respCode) {
          case '4099':
            errorMessage = 'Transaction failed. Please try again.';
            errorDetails = 'This could be due to insufficient funds, card restrictions, or bank rejection.';
            break;
          default:
            errorMessage = `Transaction failed: ${inquiryResult.respDesc}`;
            errorDetails = 'Please try again or contact support if the issue persists.';
        }
      }

      // Redirect to frontend with payment result
      const redirectUrl = new URL('http://localhost:3000/payment-result');
      redirectUrl.searchParams.append('invoiceNo', inquiryResult.invoiceNo || '');
      redirectUrl.searchParams.append('amount', inquiryResult.amount || '');
      redirectUrl.searchParams.append('currencyCode', inquiryResult.currencyCode || '');
      redirectUrl.searchParams.append('respCode', inquiryResult.respCode || '');
      redirectUrl.searchParams.append('respDesc', errorMessage);
      redirectUrl.searchParams.append('isSuccess', isSuccess.toString());
      if (errorDetails) {
        redirectUrl.searchParams.append('errorDetails', errorDetails);
      }

      console.log('Redirecting to:', redirectUrl.toString());
      res.redirect(redirectUrl.toString());
    } else {
      // Handle other response codes directly
      const redirectUrl = new URL('http://localhost:3000/payment-result');
      redirectUrl.searchParams.append('invoiceNo', invoiceNo || '');
      redirectUrl.searchParams.append('respCode', respCode || '');
      redirectUrl.searchParams.append('respDesc', respDesc || '');
      redirectUrl.searchParams.append('isSuccess', (respCode === '0000').toString());

      console.log('Redirecting to:', redirectUrl.toString());
      res.redirect(redirectUrl.toString());
    }
  } catch (error) {
    console.error('Frontend callback error:', error);
    res.redirect('http://localhost:3000/payment-result?respCode=9999&respDesc=Error processing payment&errorDetails=An unexpected error occurred. Please try again.&isSuccess=false');
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 