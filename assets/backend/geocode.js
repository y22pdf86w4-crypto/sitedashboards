// routes/geocode.js
import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

/**
 * GET /api/v1/geocode?q=ENDERECO
 * Tenta Nominatim primeiro; se não achar, usa Google Geocoding.
 * Retorna: { provider: 'nominatim' | 'google', lat, lng } ou erro HTTP.
 */
router.get('/geocode', async (req, res) => {
  const endereco = req.query.q;
  if (!endereco) {
    return res.status(400).json({ error: 'Parâmetro q é obrigatório' });
  }

  try {
    const original = String(endereco).trim();

    // 1) Nominatim (barato, sem key)
    const nominatimUrl = 'https://nominatim.openstreetmap.org/search'
      + '?format=json&addressdetails=1&limit=1&countrycodes=br'
      + `&q=${encodeURIComponent(original + ', Brasil')}`;

    console.log('[GEOCODE] Nominatim URL:', nominatimUrl);

    let nomData = [];
    try {
      const nomResp = await fetch(nominatimUrl, {
        headers: {
          'Accept-Language': 'pt-BR',
          'User-Agent': 'linhagro-logistica/1.0 (contato@linhagro.com.br)'
        }
      });
      if (nomResp.ok) {
        nomData = await nomResp.json();
      } else {
        console.warn('[GEOCODE] Nominatim HTTP != 200:', nomResp.status);
      }
    } catch (e) {
      console.warn('[GEOCODE] Erro chamando Nominatim:', e);
    }

    if (nomData && nomData.length > 0) {
      const item = nomData[0];
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);
      console.log('[GEOCODE] Nominatim sucesso:', { lat, lng });
      return res.json({
        provider: 'nominatim',
        lat,
        lng
      });
    }

    // 2) Fallback: Google Geocoding
    const googleKey = process.env.GEOCODING;
    if (!googleKey) {
      console.error('[GEOCODE] GEOCODING key não configurada no .env');
      return res.status(500).json({ error: 'Google Geocoding key não configurada' });
    }

    const googleBase = 'https://maps.googleapis.com/maps/api/geocode/json';
    const params = new URLSearchParams({
      address: original + ', Brasil',
      key: googleKey
    });

    const googleUrl = `${googleBase}?${params.toString()}`;
    console.log('[GEOCODE] Google URL:', googleUrl);

    const googleResp = await fetch(googleUrl);
    if (!googleResp.ok) {
      console.error('[GEOCODE] Erro HTTP Google:', googleResp.status);
      return res.status(502).json({ error: 'Erro HTTP no Google Geocoding' });
    }

    const googleData = await googleResp.json();
    console.log('[GEOCODE] Google status:', googleData.status);

    if (googleData.status !== 'OK' || !googleData.results || !googleData.results.length) {
      console.warn('[GEOCODE] Google sem resultados para:', original);
      return res.status(404).json({ error: 'Nenhum resultado em Nominatim nem Google' });
    }

    const loc = googleData.results[0].geometry.location;
    console.log('[GEOCODE] Google sucesso:', loc);

    return res.json({
      provider: 'google',
      lat: loc.lat,
      lng: loc.lng
    });
  } catch (e) {
    console.error('[GEOCODE] Erro geral:', e);
    return res.status(500).json({ error: 'Erro interno no geocode' });
  }
});

export default router;
