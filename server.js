/**
 * 个人记账工具 - 后端中转服务
 * 功能：
 * 1. 静态资源托管（前端HTML页面）
 * 2. AI消费分析接口 /api/ai-analysis
 * 3. AI智能问答接口 /api/ai-chat
 * 4. 请求日志记录（写入log.txt）
 */

const express = require('express');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 8080;

// 中间件配置
app.use(cors());                    // 解决跨域
app.use(express.json());            // 解析JSON请求体
app.use(express.static('./'));      // 静态文件托管

// ===== 智谱大模型API配置 =====
// 密钥从环境变量读取，部署到Render时在后台配置，不写死在代码里
const ZHIPU_KEY = process.env.ZHIPU_KEY || 'd3ce6487fc584ed789807ee3ea6c681c.kaS0AYh42dCMyIt7';
const ZHIPU_HOST = 'open.bigmodel.cn';
const ZHIPU_PATH = '/api/paas/v4/chat/completions';
const MODEL_NAME = 'glm-4-flash';

// ===== 日志功能：写入log.txt =====
function writeLog(type, content) {
  const timestamp = new Date().toLocaleString('zh-CN');
  const logLine = `[${timestamp}] [${type}] ${content}\n`;
  fs.appendFile(path.join(__dirname, 'log.txt'), logLine, (err) => {
    if (err) console.error('日志写入失败:', err);
  });
  console.log(logLine.trim());
}

/**
 * 通用：调用智谱大模型API
 * @param {string} systemPrompt 系统提示词
 * @param {string} userPrompt 用户输入
 * @param {number} maxTokens 最大返回token数
 * @param {function} callback 回调函数(err, result)
 */
function callZhipuAPI(systemPrompt, userPrompt, maxTokens, callback) {
  const postData = JSON.stringify({
    model: MODEL_NAME,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.6,
    max_tokens: maxTokens
  });

  const options = {
    hostname: ZHIPU_HOST,
    path: ZHIPU_PATH,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ZHIPU_KEY}`,
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const apiReq = https.request(options, (apiRes) => {
    let data = '';
    apiRes.on('data', (chunk) => data += chunk);
    apiRes.on('end', () => {
      try {
        const result = JSON.parse(data);
        callback(null, result);
      } catch (e) {
        callback(new Error('解析API返回失败: ' + e.message));
      }
    });
  });

  apiReq.on('error', (err) => {
    callback(err);
  });

  apiReq.write(postData);
  apiReq.end();
}

// ===== 接口1：AI消费分析 =====
app.post('/api/ai-analysis', (req, res) => {
  const { recordText, budgetText, periodType } = req.body;
  writeLog('AI分析', `收到消费分析请求，类型：${periodType || 'month'}`);

  // 根据统计模式调整系统提示词
  const isYear = periodType === 'year';
  const periodName = isYear ? '本年' : '本月';
  
  const systemPrompt = `你是在校大学生消费分析助手，根据下面学生${periodName}记账流水，生成简短消费分析报告。
要求：
1.识别大额支出，分析消费结构特点；
2.给出适合大学生生活费的实用节约建议；
3.禁止输出任何理财、股票、基金、投资相关内容；
4.语言简洁亲切，分4个部分：消费总览、结构分析、预算情况、改进建议；
5.总字数控制在300字以内，不要使用markdown标题符号，用emoji分隔各部分。`;

  const userPrompt = `${periodName}账单数据：
${budgetText}

支出明细：
${recordText}

请基于以上数据生成${periodName}消费分析报告。`;

  callZhipuAPI(systemPrompt, userPrompt, 800, (err, result) => {
    if (err) {
      writeLog('AI分析-错误', err.message);
      res.status(500).json({ error: 'AI分析服务调用失败: ' + err.message });
      return;
    }
    writeLog('AI分析-成功', '消费分析生成完成');
    res.json(result);
  });
});

// ===== 接口2：AI智能问答 =====
app.post('/api/ai-chat', (req, res) => {
  const { question, recordText } = req.body;
  writeLog('AI问答', '收到用户提问: ' + question.substring(0, 50));

  const systemPrompt = `你是个人记账助手，根据用户的记账流水数据，回答用户关于消费、账单、预算的问题。
要求：
1.结合给定的账单数据回答，不要凭空编造数据；
2.语言简洁友好，适合大学生理解；
3.禁止推荐任何理财、投资类产品；
4.如果数据不足以回答，如实说明；
5.回答控制在200字以内。`;

  const userPrompt = `记账流水数据：
${recordText}

用户问题：${question}

请基于以上数据回答用户问题。`;

  callZhipuAPI(systemPrompt, userPrompt, 500, (err, result) => {
    if (err) {
      writeLog('AI问答-错误', err.message);
      res.status(500).json({ error: 'AI问答服务调用失败: ' + err.message });
      return;
    }
    writeLog('AI问答-成功', '回答生成完成');
    res.json(result);
  });
});

// ===== 启动服务 =====
app.listen(port, () => {
  writeLog('系统', `服务启动成功，端口 ${port}`);
  console.log(`✅ 服务启动成功！`);
  console.log(`浏览器访问地址：http://127.0.0.1:${port}/个人记账工具.html`);
  console.log('按 Ctrl+C 停止服务');
});
