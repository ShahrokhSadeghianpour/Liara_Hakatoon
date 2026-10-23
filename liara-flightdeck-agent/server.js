const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const LIARA_API_BASE = 'https://api.liara.ir';

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 1. Proxy Endpoint for Liara Official REST API (Solves Browser CORS completely)
app.all('/api/liara/*', async (req, res) => {
    const liaraToken = req.headers['x-liara-token'];
    if (!liaraToken) {
        return res.status(401).json({ error: 'توکن لیارا ارسال نشده است.' });
    }

    const endpointPath = req.params[0];
    const queryString = new URLSearchParams(req.query).toString();
    const targetUrl = `${LIARA_API_BASE}/${endpointPath}${queryString ? '?' + queryString : ''}`;

    try {
        const fetchOptions = {
            method: req.method,
            headers: {
                'Authorization': `Bearer ${liaraToken}`,
                'Content-Type': 'application/json'
            }
        };

        if (!['GET', 'HEAD'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
            fetchOptions.body = JSON.stringify(req.body);
        }

        const response = await fetch(targetUrl, fetchOptions);
        const contentType = response.headers.get('content-type') || '';
        const data = contentType.includes('application/json')
            ? await response.json()
            : await response.text();

        res.status(response.status).json({
            ok: response.ok,
            status: response.status,
            data
        });
    } catch (error) {
        res.status(500).json({
            ok: false,
            error: 'خطا در برقراری ارتباط با سرور لیارا',
            details: error.message
        });
    }
});

// 2. Proxy Endpoint for BoxAPI / OpenAI Compatible LLM
app.post('/api/ai/chat', async (req, res) => {
    const { baseUrl, apiKey, model, messages } = req.body;
    if (!apiKey) {
        return res.status(400).json({ error: 'NO_BOX_API_KEY' });
    }

    const cleanUrl = (baseUrl || 'https://ai.boxapi.ir/ai/v1').replace(/\/+$/, '');
    try {
        const response = await fetch(`${cleanUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model || 'gpt-6-luna',
                messages,
                temperature: 0.3
            })
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json({ error: data?.error?.message || 'LLM API Error' });
        }

        res.json({
            reply: data?.choices?.[0]?.message?.content || 'پاسخی دریافت نشد.'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Healthcheck Endpoint for SRE Verification
app.get('/api/health', (req, res) => {
    res.json({
        status: 'UP',
        service: 'Liara FlightDeck AI Agent Backend',
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Liara FlightDeck Agent running at http://localhost:${PORT}`);
});