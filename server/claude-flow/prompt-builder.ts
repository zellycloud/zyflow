/**
 * OpenSpec 문서 기반 프롬프트 빌더
 * @module server/claude-flow/prompt-builder
 */

import { readFile, access, readdir } from 'fs/promises'
import { join, basename } from 'path'
import type { PromptSection, PromptBuildOptions, ExecutionMode } from './types.js'

/**
 * OpenSpec 문서를 claude-flow swarm 프롬프트로 변환하는 빌더
 */
export class OpenSpecPromptBuilder {
  private projectPath: string
  private changeId: string
  private taskId?: string
  private taskTitle?: string
  private mode: ExecutionMode
  private options: PromptBuildOptions

  constructor(
    projectPath: string,
    changeId: string,
    mode: ExecutionMode = 'full',
    taskId?: string,
    taskTitle?: string,
    options: PromptBuildOptions = {}
  ) {
    this.projectPath = projectPath
    this.changeId = changeId
    this.taskId = taskId
    this.taskTitle = taskTitle
    this.mode = mode
    this.options = {
      includeFullClaudeMd: false,
      includeDesign: true,
      includeSpecs: true,
      ...options,
    }
  }

  /**
   * 전체 프롬프트 빌드
   */
  async build(): Promise<string> {
    const sections: PromptSection[] = []

    // 1. 프로젝트 맥락 (CLAUDE.md)
    const projectContext = await this.buildProjectContext()
    if (projectContext) sections.push(projectContext)

    // 2. Change 정보 (proposal.md)
    const changeSection = await this.buildChangeSection()
    if (changeSection) sections.push(changeSection)

    // 3. 설계 문서 (design.md) - 있는 경우
    if (this.options.includeDesign) {
      const designSection = await this.buildDesignSection()
      if (designSection) sections.push(designSection)
    }

    // 4. 현재 태스크 (tasks.md)
    const tasksSection = await this.buildTasksSection()
    if (tasksSection) sections.push(tasksSection)

    // 5. 관련 스펙 파일 목록
    if (this.options.includeSpecs) {
      const specsSection = await this.buildSpecsSection()
      if (specsSection) sections.push(specsSection)
    }

    // 6. 지시사항
    sections.push(this.buildInstructions())

    return sections.map(s => `## ${s.title}\n\n${s.content}`).join('\n\n---\n\n')
  }

  /**
   * CLAUDE.md 로드 및 요약
   */
  private async buildProjectContext(): Promise<PromptSection | null> {
    const claudeMdPath = join(this.projectPath, 'CLAUDE.md')

    try {
      await access(claudeMdPath)
      const content = await readFile(claudeMdPath, 'utf-8')

      if (this.options.includeFullClaudeMd) {
        return {
          title: '프로젝트 맥락',
          content: content,
        }
      }

      // 요약 버전: 핵심 섹션만 추출
      const summary = this.summarizeClaudeMd(content)
      return {
        title: '프로젝트 맥락',
        content: summary,
      }
    } catch {
      return null
    }
  }

  /**
   * CLAUDE.md 요약 (핵심 정보만 추출)
   */
  private summarizeClaudeMd(content: string): string {
    const lines = content.split('\n')
    const summaryLines: string[] = []
    let inImportantSection = false
    let skipUntilNextHeader = false

    // 중요 섹션 키워드
    const importantSections = [
      '기본 작업 규칙',
      '개발 환경',
      '기술 스택',
      'UI / UX',
      'React Query',
    ]

    // 건너뛸 섹션
    const skipSections = [
      '참고 문서',
      '보안',
      'GitHub 인증',
      'Langfuse',
      'TDD',
    ]

    for (const line of lines) {
      if (line.startsWith('##')) {
        const headerText = line.replace(/^#+\s*/, '').toLowerCase()

        skipUntilNextHeader = skipSections.some(s =>
          headerText.includes(s.toLowerCase())
        )

        inImportantSection = importantSections.some(s =>
          headerText.includes(s.toLowerCase())
        )

        if (inImportantSection && !skipUntilNextHeader) {
          summaryLines.push(line)
        }
      } else if (inImportantSection && !skipUntilNextHeader) {
        summaryLines.push(line)
      }
    }

    // 최대 2000자로 제한
    const result = summaryLines.join('\n')
    if (result.length > 2000) {
      return result.substring(0, 2000) + '\n\n...(요약됨)'
    }

    return result || '프로젝트 맥락 정보 없음'
  }

  /**
   * Change 정보 로드 (proposal.md)
   */
  private async buildChangeSection(): Promise<PromptSection | null> {
    const proposalPath = join(
      this.projectPath,
      'openspec',
      'changes',
      this.changeId,
      'proposal.md'
    )

    try {
      await access(proposalPath)
      const content = await readFile(proposalPath, 'utf-8')

      // 제목 추출
      const titleMatch = content.match(/^#\s+(.+)$/m)
      const title = titleMatch ? titleMatch[1] : this.changeId

      // Summary와 Motivation 섹션 추출
      const summaryMatch = content.match(/## Summary\s*\n([\s\S]*?)(?=\n##|$)/)
      const motivationMatch = content.match(/## Motivation\s*\n([\s\S]*?)(?=\n##|$)/)

      const summary = summaryMatch ? summaryMatch[1].trim() : ''
      const motivation = motivationMatch ? motivationMatch[1].trim() : ''

      return {
        title: '현재 Change',
        content: `**ID**: ${this.changeId}\n**제목**: ${title}\n\n### Summary\n${summary}\n\n### Motivation\n${motivation}`,
      }
    } catch {
      return {
        title: '현재 Change',
        content: `**ID**: ${this.changeId}\n\n(proposal.md를 찾을 수 없습니다)`,
      }
    }
  }

  /**
   * 설계 문서 로드 (design.md)
   */
  private async buildDesignSection(): Promise<PromptSection | null> {
    const designPath = join(
      this.projectPath,
      'openspec',
      'changes',
      this.changeId,
      'design.md'
    )

    try {
      await access(designPath)
      const content = await readFile(designPath, 'utf-8')

      // 최대 3000자로 제한
      const trimmed = content.length > 3000
        ? content.substring(0, 3000) + '\n\n...(요약됨)'
        : content

      return {
        title: '설계 문서',
        content: trimmed,
      }
    } catch {
      return null
    }
  }

  /**
   * 태스크 목록 로드 (tasks.md)
   */
  private async buildTasksSection(): Promise<PromptSection | null> {
    const tasksPath = join(
      this.projectPath,
      'openspec',
      'changes',
      this.changeId,
      'tasks.md'
    )

    try {
      await access(tasksPath)
      const content = await readFile(tasksPath, 'utf-8')

      // 미완료 태스크만 추출
      const incompleteTasks = this.extractIncompleteTasks(content)

      if (this.mode === 'single' && (this.taskId || this.taskTitle)) {
        // 단일 태스크 모드: 특정 태스크만 표시
        // taskTitle로 먼저 검색 시도 (더 정확함), 없으면 taskId로 검색
        let specificTask: string | null = null
        if (this.taskTitle) {
          specificTask = this.extractSpecificTask(content, this.taskTitle)
        }
        if (!specificTask && this.taskId) {
          specificTask = this.extractSpecificTask(content, this.taskId)
        }
        return {
          title: '현재 태스크',
          content: specificTask || `태스크 "${this.taskTitle || this.taskId}"를 찾을 수 없습니다.`,
        }
      }

      return {
        title: '현재 태스크 (미완료)',
        content: incompleteTasks || '모든 태스크가 완료되었습니다.',
      }
    } catch {
      return {
        title: '현재 태스크',
        content: '(tasks.md를 찾을 수 없습니다)',
      }
    }
  }

  /**
   * 미완료 태스크 추출
   */
  private extractIncompleteTasks(content: string): string {
    const lines = content.split('\n')
    const result: string[] = []
    let currentHeader = ''
    let hasIncomplete = false

    for (const line of lines) {
      if (line.startsWith('##')) {
        if (hasIncomplete && currentHeader) {
          result.push('')
        }
        currentHeader = line
        hasIncomplete = false
      } else if (line.match(/^-\s*\[\s*\]/)) {
        // 미완료 태스크
        if (!hasIncomplete && currentHeader) {
          result.push(currentHeader)
          hasIncomplete = true
        }
        result.push(line)
      }
    }

    return result.join('\n')
  }

  /**
   * 특정 태스크 추출
   */
  private extractSpecificTask(content: string, taskId: string): string | null {
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.includes(taskId) || line.match(new RegExp(`^-\\s*\\[.?\\].*${taskId}`, 'i'))) {
        // 컨텍스트를 위해 이전 헤더도 포함
        let headerIndex = i
        while (headerIndex > 0 && !lines[headerIndex].startsWith('##')) {
          headerIndex--
        }

        const context = lines.slice(headerIndex, i + 1).join('\n')
        return context
      }
    }

    return null
  }

  /**
   * 관련 스펙 파일 목록
   */
  private async buildSpecsSection(): Promise<PromptSection | null> {
    const specsPath = join(
      this.projectPath,
      'openspec',
      'changes',
      this.changeId,
      'specs'
    )

    try {
      await access(specsPath)
      const files = await readdir(specsPath)
      const mdFiles = files.filter(f => f.endsWith('.md'))

      if (mdFiles.length === 0) {
        return null
      }

      const fileList = mdFiles.map(f => `- specs/${f}`).join('\n')

      return {
        title: '관련 스펙 파일',
        content: `다음 스펙 파일들을 참고하세요:\n${fileList}`,
      }
    } catch {
      return null
    }
  }

  /**
   * 지시사항 빌드
   */
  private buildInstructions(): PromptSection {
    const baseInstructions = [
      '1. 위 태스크를 순서대로 구현하세요.',
      '2. 각 태스크 완료 후 tasks.md의 체크박스를 업데이트하세요.',
      '3. 테스트가 있다면 반드시 통과시키세요.',
      '4. 코드 스타일과 기존 패턴을 준수하세요.',
    ]

    if (this.mode === 'analysis') {
      return {
        title: '지시사항 (분석 모드)',
        content: [
          '**분석 모드**: 코드 변경 없이 분석만 수행합니다.',
          '',
          '1. 현재 코드베이스 구조를 분석하세요.',
          '2. 태스크 구현에 필요한 파일들을 식별하세요.',
          '3. 잠재적인 문제점이나 충돌 가능성을 파악하세요.',
          '4. 구현 전략을 제안하세요.',
        ].join('\n'),
      }
    }

    if (this.mode === 'single') {
      return {
        title: '지시사항 (단일 태스크 모드)',
        content: [
          `**단일 태스크 모드**: 지정된 태스크만 처리합니다.`,
          '',
          ...baseInstructions,
          '5. 지정된 태스크 외의 작업은 수행하지 마세요.',
        ].join('\n'),
      }
    }

    return {
      title: '지시사항',
      content: baseInstructions.join('\n'),
    }
  }
}
