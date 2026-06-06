export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { imageBase64, imageMimeType } = req.body;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
    },
    body: JSON.stringify({
      model: 'nvidia/nemotron-nano-12b-v2-vl:free',
      max_tokens: 32,
      messages: [
        { role: 'system', content: 'You identify food in photos. Reply with only the food name, nothing else. 1-4 words max.' },
        { role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } },
          { type: 'text', text: 'What food is this? Reply with only the food name, 1-4 words.' }
        ]}
      ]
    })
  });

  const data = await response.json();
  if (data.error) return res.status(500).json({ error: data.error.message });

  const food = data.choices[0].message.content.trim().replace(/['".,!?]/g, '');
  res.status(200).json({ food });
}
