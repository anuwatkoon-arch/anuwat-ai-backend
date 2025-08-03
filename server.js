const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://your-frontend-domain.vercel.app'] // แทนที่ด้วยโดเมนจริง
        : ['http://localhost:3000', 'http://127.0.0.1:5500'], // สำหรับ development
    credentials: true
}));

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
        version: '1.0.1'
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
