/**
 * Global Chat Router
 * 
 * Change 선택 없이 일반적인 AI 대화를 위한 API
 * 기존 CLI ProcessManager를 활용
 */

import { Router } from 'express'
import { randomUUID } from 'crypto'
import { getProcessManager, initProcessManager } from '../cli-adapter/process-manager.js'
import { getActiveProject } from '../config.js'

const router = Router()

// 전역 채팅 세션 저장소 (세션ID -> 출력 버퍼)
const globalChatSessions = new Map<string, {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  lastActivity: number
}>()

/**
 * POST /api/chat/global - 전역 채팅 (CLI 기반 스트리밍)
 */
router.post('/global', async (req, res) => {
  try {
    const { messages, sessionId: existingSessionId } = req.body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages are required' })
    }

    // 마지막 사용자 메시지 가져오기
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== 'user') {
      return res.status(400).json({ error: 'Last message must be from user' })
    }

    // 프로젝트 경로 가져오기
    const activeProject = await getActiveProject()
    const projectPath = activeProject?.path || process.cwd()

    // Process Manager 초기화
    try {
      initProcessManager(projectPath)
    } catch {
      // 이미 초기화됨
    }
    const processManager = getProcessManager(projectPath)

    // 시스템 프롬프트
    const systemPrompt = `당신은 ZyFlow 프로젝트 관리 도구의 AI 어시스턴트입니다.
사용자의 질문에 친절하고 도움이 되는 답변을 제공해주세요.

## 지침:
- 답변은 한국어로 작성
- 명확하고 간결하게 답변  
- 코드나 명령어는 마크다운 코드 블록으로 표시
- 불확실한 정보는 그렇다고 명시`

    // 이전 대화 컨텍스트 포함
    const historyContext = messages.slice(-6, -1).map((m: { role: string; content: string }) => 
      `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
    ).join('\n\n')

    let prompt = lastMessage.content
    if (historyContext) {
      prompt = `이전 대화:\n${historyContext}\n\n현재 질문: ${prompt}`
    }

    // 전역 채팅용 임시 changeId 생성
    const globalChangeId = `global-chat-${randomUUID().slice(0, 8)}`

    // CLI 세션 시작
    const startResult = await processManager.start({
      profileId: 'claude',
      changeId: globalChangeId,
      projectPath,
      initialPrompt: prompt,
      extraArgs: ['--append-system-prompt', systemPrompt],
    })

    if (!startResult.success || !startResult.sessionId) {
      return res.status(500).json({ 
        error: startResult.error || 'Failed to start CLI session'
      })
    }

    const cliSessionId = startResult.sessionId

    // 스트리밍 응답 설정
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Transfer-Encoding', 'chunked')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    // 출력 폴링 (실시간 스트리밍)
    let lastOutputIndex = 0
    let completedCheck = 0
    const maxChecks = 300 // 최대 5분 (1초당 1번)

    const pollOutput = async () => {
      const output = processManager.getOutput(cliSessionId)
      
      // 새 출력이 있으면 전송
      for (let i = lastOutputIndex; i < output.length; i++) {
        const item = output[i]
        if (item.type === 'stdout') {
          // ANSI escape 코드 제거
          // eslint-disable-next-line no-control-regex
          const text = item.content.replace(/\x1b\[[0-9;]*m/g, '')
          res.write(text)
        }
      }
      lastOutputIndex = output.length

      // 세션 상태 확인
      const session = processManager.getSession(cliSessionId)
      if (!session || session.status === 'completed' || session.status === 'error') {
        completedCheck++
        if (completedCheck >= 2) {
          res.end()
          return
        }
      }

      // 타임아웃 체크
      if (pollCount >= maxChecks) {
        res.write('\n\n⏰ 응답 시간 초과')
        res.end()
        return
      }

      pollCount++
      setTimeout(pollOutput, 100)
    }

    let pollCount = 0
    pollOutput()

    // 요청 취소 시
    req.on('close', async () => {
      try {
        await processManager.stop(cliSessionId, true)
      } catch {
        // 무시
      }
    })

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
