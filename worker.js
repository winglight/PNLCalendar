addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
  });
  
  async function handleRequest(request) {
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Accept',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
  
    // 只处理 POST 请求
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
  
    try {
      // 解析客户端请求的数据
      const requestData = await request.json();
      const targetUrl = requestData.url;
  
      if (!targetUrl) {
        return new Response('Target URL is required', { status: 400 });
      }
  
      // 定义请求头
      const headers = new Headers({
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7,es;q=0.6,mn;q=0.5,ms;q=0.4,ko;q=0.3,la;q=0.2,th;q=0.1,is;q=0.1,ar;q=0.1,hmn;q=0.1,de;q=0.1,xh;q=0.1,eo;q=0.1,mi;q=0.1,pt;q=0.1,kk;q=0.1,bg;q=0.1,jv;q=0.1,zh-TW;q=0.1,nl;q=0.1',
        'cache-control': 'max-age=0',
        'cookie': requestData.cookie || '',
        'dnt': '1',
        'priority': 'u=0, i',
        'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      });
  
      // 向目标 URL 发起请求
      const response = await fetch(targetUrl, {
        method: 'GET', // 按 curl 的方式使用 GET 请求
        headers,
      });
  
      // 读取目标 URL 响应内容
      const responseData = await response.text();
  
      // 返回代理响应
      return new Response(responseData, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': response.headers.get('Content-Type') || 'text/plain',
        },
        status: response.status,
      });
    } catch (error) {
      return new Response(`Proxy error: ${error.message}`, {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain',
        },
      });
    }
  }