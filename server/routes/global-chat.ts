/**
 * Global Chat Router
 * 
 * Change 선택 없이 일반적인 AI 대화를 위한 API
 */

import { Router } from 'express'

const router = Router()

/**
 * POST /api/chat/global - 전역 채팅 (스트리밍)
 */
router.post('/global', async (req, res) => {
  try {
    const { messages, projectId } = req.body

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages are required' })
    }

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicApiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })
    }

    // 시스템 프롬프트
    const systemPrompt = `당신은 ZyFlow 프로젝트 관리 도구의 AI 어시스턴트입니다.
사용자의 질문에 친절하고 도움이 되는 답변을 제공해주세요.

## 지침:
- 답변은 한국어로 작성
- 명확하고 간결하게 답변
- 코드나 명령어는 마크다운 코드 블록으로 표시
- 불확실한 정보는 그렇다고 명시`

    // 스트리밍 응답 설정
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Transfer-Encoding', 'chunked')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    // Anthropic API 호출
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        stream: true,
        system: systemPrompt,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Global Chat] Anthropic API error:', errorText)
      return res.status(response.status).json({ error: 'Failed to get AI response' })
    }

    // SSE 스트리밍 처리
    const reader = response.body?.getReader()
    if (!reader) {
      return res.status(500).json({ error: 'Failed to read stream' })
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue
          
          try {
            const parsed = JSON.parse(data)
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              res.write(parsed.delta.text)
            }
          } catch {
            // JSON 파싱 실패 무시
          }
        }
      }
    }

    res.end()
  } catch (error) {
    console.error('[Global Chat] Error:', error)
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process chat',
      })
    } else {
      res.end()
    }
  }
})

export { router as globalChatRouter }
