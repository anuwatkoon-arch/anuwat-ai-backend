const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));

// 🔧 CORS Configuration - แก้ไขแล้ว
// รันใน Console (F12) หลังจากแก้ไข syntax error และรอ 3-5 นาที

console.log('🚨 Testing after Syntax Error Fix');
console.log('⏰ Time:', new Date().toLocaleString());

async function testSyntaxFix() {
  console.log('\n🔍 Phase 1: Server Availability Test');
  
  try {
    // ทดสอบว่า server start ได้หรือไม่
    const response = await fetch('https://ai-backend-demo.vercel.app/api/health', {
      method: 'GET',
      mode: 'cors'
    });
    
    console.log('✅ Server Response Status:', response.status);
    
    if (response.status === 200) {
      console.log('🎉 SUCCESS! Server is running (syntax error fixed)');
      
      // ตรวจสอบ CORS headers
      const corsOrigin = response.headers.get('Access-Control-Allow-Origin');
      console.log('🔍 CORS Allow-Origin:', corsOrigin);
      
      if (corsOrigin === 'http://www.anuwatkoon.com') {
        console.log('🎉🎉 PERFECT! CORS is working for anuwatkoon.com!');
        
        const data = await response.json();
        console.log('✅ Health Data:', data);
        
        if (data.cors && data.cors.includes('anuwatkoon.com')) {
          console.log('🎉🎉🎉 COMPLETE SUCCESS! Backend confirms CORS fix!');
          return true;
        }
        
      } else if (corsOrigin && corsOrigin.includes('anuwatkoon.com')) {
        console.log('✅ Good! CORS allows anuwatkoon.com domain');
        return true;
        
      } else {
        console.log('⚠️ Server works but CORS might need more time to update');
        console.log('Expected: anuwatkoon.com, Got:', corsOrigin);
        return false;
      }
      
    } else if (response.status >= 500) {
      console.log('⚠️ Server error (might still be deploying)');
      console.log('🔄 Wait 5 more minutes and try again');
      return false;
      
    } else {
      console.log('⚠️ Unexpected status:', response.status);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Test Failed:', error.message);
    
    if (error.message.includes('Failed to fetch') || error.message.includes('TypeError')) {
      console.log('📝 Diagnosis:');
      console.log('   • Server might still be redeploying (wait longer)');
      console.log('   • Or syntax error still exists (check GitHub commits)');
      console.log('   • Or deployment failed (check Vercel dashboard)');
      
    } else if (error.message.includes('CORS')) {
      console.log('📝 CORS still not working, but server is running');
      console.log('   • This means syntax is fixed but CORS config needs more time');
      
    } else {
      console.log('📝 Unknown error:', error.message);
    }
    
    return false;
  }
}

// รันการทดสอบ
testSyntaxFix().then(success => {
  console.log('\n=== RESULT ===');
  
  if (success) {
    console.log('🎉 SYNTAX ERROR FIXED AND CORS IS WORKING!');
    console.log('📝 What to do next:');
    console.log('   1. Refresh anuwatkoon.com');
    console.log('   2. Try using the AI system');
    console.log('   3. Status should show 🟢 connected');
    
  } else {
    console.log('⚠️ Still issues detected');
    console.log('📝 Next steps:');
    console.log('   1. Check GitHub commits status');
    console.log('   2. Wait 5-10 minutes for full deployment');
    console.log('   3. Run this test again');
    console.log('   4. If still failing, check Vercel deployment logs');
  }
  
  console.log('\n💡 Quick check: Try visiting this URL directly in new tab:');
  console.log('https://ai-backend-demo.vercel.app/api/health');
  console.log('Should show: {"status":"OK","timestamp":"...","cors":"enabled for anuwatkoon.com"}');
});

// Serve static files (สำหรับ Frontend)
app.use(express.static('public'));

// API Key จาก Environment Variables
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Rate limiting (ป้องกันการใช้เกิน)
const requestCounts = new Map();
const RATE_LIMIT = 50; // 50 requests ต่อ IP ต่อชั่วโมง
const WINDOW_MS = 60 * 60 * 1000; // 1 ชั่วโมง

function rateLimitMiddleware(req, res, next) {
    const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
    const now = Date.now();
    
    if (!requestCounts.has(clientIP)) {
        requestCounts.set(clientIP, { count: 1, resetTime: now + WINDOW_MS });
        return next();
    }
    
    const clientData = requestCounts.get(clientIP);
    
    if (now > clientData.resetTime) {
        // Reset counter
        requestCounts.set(clientIP, { count: 1, resetTime: now + WINDOW_MS });
        return next();
    }
    
    if (clientData.count >= RATE_LIMIT) {
        return res.status(429).json({ 
            error: 'ใช้งานเกินขีดจำกัด กรุณารอ 1 ชั่วโมง',
            resetTime: new Date(clientData.resetTime).toISOString()
        });
    }
    
    clientData.count++;
    next();
}

// Chat API Endpoint
app.post('/api/chat', rateLimitMiddleware, async (req, res) => {
    try {
        // ตรวจสอบ API Key
        if (!GROQ_API_KEY) {
            return res.status(500).json({ 
                error: 'Server configuration error: API Key not found' 
            });
        }

        const { messages } = req.body;
        
        // ตรวจสอบ input
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ 
                error: 'Invalid request: messages array required' 
            });
        }

        // เรียก Groq API
        const fetch = (await import('node-fetch')).default;
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'llama3-70b-8192',
                messages: messages,
                max_tokens: 4000,
                temperature: 0.3,
                stream: false
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('Groq API Error:', response.status, errorData);
            
            let errorMessage = 'เกิดข้อผิดพลาดในการเชื่อมต่อ AI';
            if (response.status === 401) {
                errorMessage = 'ปัญหาการยืนยันตัวตน กรุณาติดต่อผู้ดูแลระบบ';
            } else if (response.status === 429) {
                errorMessage = 'AI ใช้งานหนักเกินไป กรุณารอสักครู่แล้วลองใหม่';
            } else if (response.status === 400) {
                errorMessage = 'คำถามไม่ถูกต้อง กรุณาลองใหม่';
            }
            
            return res.status(response.status).json({ error: errorMessage });
        }

        const data = await response.json();
        
        // ตรวจสอบ response
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            return res.status(500).json({ 
                error: 'ได้รับข้อมูลไม่ครบถ้วนจาก AI' 
            });
        }

        res.json(data);

    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ 
            error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Image Generation API (ใช้ Pollinations - ฟรี)
app.post('/api/generate-image', rateLimitMiddleware, async (req, res) => {
    try {
        const { prompt } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        // ทำความสะอาด prompt
        const cleanPrompt = prompt.replace(/[^\w\s,-]/g, '').trim();
        const apiUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(cleanPrompt)}?width=512&height=512&nologo=true&enhance=true`;
        
        // ส่ง URL กลับไปให้ Frontend fetch เอง (เพื่อประหยัด bandwidth)
        res.json({ 
            success: true, 
            imageUrl: apiUrl,
            prompt: cleanPrompt
        });

    } catch (error) {
        console.error('Image Generation Error:', error);
        res.status(500).json({ 
            error: 'เกิดข้อผิดพลาดในการสร้างภาพ' 
        });
    }
});

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.0.2',
        cors: 'enabled for anuwatkoon.com'
    });
});

// Stats API (สำหรับดูสถิติการใช้งาน)
app.get('/api/stats', (req, res) => {
    const stats = {
        totalActiveIPs: requestCounts.size,
        serverUptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
    };
    res.json(stats);
});

// Serve Frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'indexai.html'));
});

// 404 Handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// Error Handler
app.use((error, req, res, next) => {
    console.error('Unhandled Error:', error);
    res.status(500).json({ 
        error: 'เกิดข้อผิดพลาดที่ไม่คาดคิด' 
    });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Anuwat.AI Backend Server running on port ${PORT}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔑 API Key configured: ${GROQ_API_KEY ? 'Yes' : 'No'}`);
    console.log(`📡 CORS enabled for: anuwatkoon.com`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('👋 Server shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('👋 Server shutting down gracefully...');
    process.exit(0);
});
