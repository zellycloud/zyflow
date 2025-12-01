import { parseTasksFileFlexible } from './parser-utils.js'

// 테스트용 디버그 함수
export function debugParseTest() {
  const content = `## 1. Main Section

### 1.1 Subsection A

- [ ] Task A1
- [ ] Task A2

### 1.2 Subsection B

- [ ] Task B1
`

  console.log('=== DEBUG PARSE TEST ===')
  console.log('Input content:')
  console.log(content)
  console.log('\n=== PARSE RESULT ===')
  
  try {
    const result = parseTasksFileFlexible('debug-test', content)
    console.log('Groups found:', result.groups.length)
    result.groups.forEach((group, index) => {
      console.log(`Group ${index}:`, {
        id: group.id,
        title: group.title,
        tasksCount: group.tasks.length
      })
    })
    return result
  } catch (error) {
    console.error('Parse error:', error)
    throw error
  }
}