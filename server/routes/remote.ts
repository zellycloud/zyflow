/**
 * Remote Server & Project API Routes
 * 원격 서버 관리 및 프로젝트 연결 API
 */

import { Router } from 'express'
import {
  // Config
  getRemoteServers,
  getRemoteServerById,
  addRemoteServer,
  updateRemoteServer,
  removeRemoteServer,
  updateLastConnected,
  addRemoteProject,
  getServerForProject,
  loadIntegratedConfig,
} from '../remote/remote-config.js'
import {
  // SSH Manager
  testConnection,
  listDirectory,
  readRemoteFile,
  writeRemoteFile,
  executeCommand,
  getGitStatus,
  gitPull,
  gitPush,
  closeConnection,
  getConnectionStatus,
  exists,
} from '../remote/ssh-manager.js'
import type {
  AddRemoteServerRequest,
  AddRemoteProjectRequest,
  RemoteServer,
} from '../remote/types.js'
import { parseSSHConfig } from '../remote/ssh-config-parser.js'

const router = Router()

// ============================================
// 원격 서버 관리 API
// ============================================

/**
 * GET /api/remote/servers
 * 모든 원격 서버 목록 조회
 */
router.get('/servers', async (_req, res) => {
  try {
    const servers = await getRemoteServers()

    // 연결 상태 추가
    const serversWithStatus = servers.map((server) => ({
      ...server,
      status: getConnectionStatus(server.id),
      // 민감 정보 제거
      auth: {
        ...server.auth,
        password: server.auth.password ? '***' : undefined,
        passphrase: server.auth.passphrase ? '***' : undefined,
      },
    }))

    res.json({ servers: serversWithStatus })
  } catch (err) {
    console.error('[Remote] Failed to list servers:', err)
    res.status(500).json({ error: 'Failed to list servers' })
  }
})

/**
 * GET /api/remote/ssh-config
 * ~/.ssh/config에서 호스트 목록 가져오기
 */
router.get('/ssh-config', async (_req, res) => {
  try {
    const hosts = await parseSSHConfig()
    res.json({ hosts })
  } catch (err) {
    console.error('[Remote] Failed to parse SSH config:', err)
    res.status(500).json({ error: 'Failed to parse SSH config' })
  }
})

/**
 * POST /api/remote/servers/from-ssh-config
 * SSH config의 호스트를 서버로 추가
 */
router.post('/servers/from-ssh-config', async (req, res) => {
  try {
    const { hostAlias } = req.body as { hostAlias: string }

    if (!hostAlias) {
      res.status(400).json({ error: 'hostAlias is required' })
      return
    }

    const hosts = await parseSSHConfig()
    const host = hosts.find((h) => h.name === hostAlias)

    if (!host) {
      res.status(404).json({ error: `Host not found in SSH config: ${hostAlias}` })
      return
    }

    const server = await addRemoteServer({
      name: host.name,
      host: host.hostName,
      port: host.port,
      auth: {
        type: 'privateKey',
        username: host.user,
        privateKeyPath: host.identityFile,
      },
    })

    res.json({ server })
  } catch (err) {
    console.error('[Remote] Failed to add server from SSH config:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to add server' })
  }
})

/**
 * GET /api/remote/servers/:id
 * 특정 서버 조회
 */
router.get('/servers/:id', async (req, res) => {
  try {
    const server = await getRemoteServerById(req.params.id)
    if (!server) {
      res.status(404).json({ error: 'Server not found' })
      return
    }

    res.json({
      server: {
        ...server,
        status: getConnectionStatus(server.id),
        auth: {
          ...server.auth,
          password: server.auth.password ? '***' : undefined,
          passphrase: server.auth.passphrase ? '***' : undefined,
        },
      },
    })
  } catch (err) {
    console.error('[Remote] Failed to get server:', err)
    res.status(500).json({ error: 'Failed to get server' })
  }
})

/**
 * POST /api/remote/servers
 * 새 원격 서버 추가
 */
router.post('/servers', async (req, res) => {
  try {
    const body = req.body as AddRemoteServerRequest

    if (!body.name || !body.host || !body.auth) {
      res.status(400).json({ error: 'Missing required fields: name, host, auth' })
      return
    }

    const server = await addRemoteServer({
      name: body.name,
      host: body.host,
      port: body.port || 22,
      auth: body.auth,
    })

    res.json({ server })
  } catch (err) {
    console.error('[Remote] Failed to add server:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to add server' })
  }
})

/**
 * PUT /api/remote/servers/:id
 * 서버 정보 수정
 */
router.put('/servers/:id', async (req, res) => {
  try {
    const updates = req.body as Partial<RemoteServer>
    const server = await updateRemoteServer(req.params.id, updates)
    res.json({ server })
  } catch (err) {
    console.error('[Remote] Failed to update server:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update server' })
  }
})

/**
 * DELETE /api/remote/servers/:id
 * 서버 삭제
 */
router.delete('/servers/:id', async (req, res) => {
  try {
    // 연결 종료
    closeConnection(req.params.id)
    // 설정에서 삭제
    await removeRemoteServer(req.params.id)
    res.json({ success: true })
  } catch (err) {
    console.error('[Remote] Failed to remove server:', err)
    res.status(500).json({ error: 'Failed to remove server' })
  }
})

/**
 * POST /api/remote/servers/:id/test
 * 연결 테스트
 */
router.post('/servers/:id/test', async (req, res) => {
  try {
    const server = await getRemoteServerById(req.params.id)
    if (!server) {
      res.status(404).json({ error: 'Server not found' })
      return
    }

    const result = await testConnection(server)

    if (result.success) {
      await updateLastConnected(server.id)
    }

    res.json(result)
  } catch (err) {
    console.error('[Remote] Connection test failed:', err)
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Connection test failed',
    })
  }
})

/**
 * POST /api/remote/servers/:id/disconnect
 * 연결 종료
 */
router.post('/servers/:id/disconnect', async (req, res) => {
  try {
    closeConnection(req.params.id)
    res.json({ success: true })
  } catch (err) {
    console.error('[Remote] Failed to disconnect:', err)
    res.status(500).json({ error: 'Failed to disconnect' })
  }
})

// ============================================
// 원격 파일시스템 API
// ============================================

/**
 * GET /api/remote/servers/:id/browse
 * 디렉토리 목록 조회
 */
router.get('/servers/:id/browse', async (req, res) => {
  try {
    const server = await getRemoteServerById(req.params.id)
    if (!server) {
      res.status(404).json({ error: 'Server not found' })
      return
    }

    const path = (req.query.path as string) || '/'
    const listing = await listDirectory(server, path)

    res.json({ listing })
  } catch (err) {
    console.error('[Remote] Failed to browse directory:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to browse directory' })
  }
})

/**
 * GET /api/remote/servers/:id/file
 * 파일 읽기
 */
router.get('/servers/:id/file', async (req, res) => {
  try {
    const server = await getRemoteServerById(req.params.id)
    if (!server) {
      res.status(404).json({ error: 'Server not found' })
      return
    }

    const path = req.query.path as string
    if (!path) {
      res.status(400).json({ error: 'Path is required' })
      return
    }

    const content = await readRemoteFile(server, path)
    res.json({ path, content })
  } catch (err) {
    console.error('[Remote] Failed to read file:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to read file' })
  }
})

/**
 * PUT /api/remote/servers/:id/file
 * 파일 쓰기
 */
router.put('/servers/:id/file', async (req, res) => {
  try {
    const server = await getRemoteServerById(req.params.id)
    if (!server) {
      res.status(404).json({ error: 'Server not found' })
      return
    }

    const { path, content } = req.body as { path: string; content: string }
    if (!path || content === undefined) {
      res.status(400).json({ error: 'Path and content are required' })
      return
    }

    await writeRemoteFile(server, path, content)
    res.json({ success: true, path })
  } catch (err) {
    console.error('[Remote] Failed to write file:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to write file' })
  }
})

/**
 * POST /api/remote/servers/:id/exec
 * 명령어 실행
 */
router.post('/servers/:id/exec', async (req, res) => {
  try {
    const server = await getRemoteServerById(req.params.id)
    if (!server) {
      res.status(404).json({ error: 'Server not found' })
      return
    }

    const { command, cwd, timeout } = req.body as {
      command: string
      cwd?: string
      timeout?: number
    }

    if (!command) {
      res.status(400).json({ error: 'Command is required' })
      return
    }

    const result = await executeCommand(server, command, { cwd, timeout })
    res.json(result)
  } catch (err) {
    console.error('[Remote] Failed to execute command:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Command execution failed' })
  }
})

/**
 * GET /api/remote/servers/:id/exists
 * 파일/디렉토리 존재 확인
 */
router.get('/servers/:id/exists', async (req, res) => {
  try {
    const server = await getRemoteServerById(req.params.id)
    if (!server) {
      res.status(404).json({ error: 'Server not found' })
      return
    }

    const path = req.query.path as string
    if (!path) {
      res.status(400).json({ error: 'Path is required' })
      return
    }

    const fileExists = await exists(server, path)
    res.json({ path, exists: fileExists })
  } catch (err) {
    console.error('[Remote] Failed to check existence:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to check existence' })
  }
})

// ============================================
// 원격 Git API
// ============================================

/**
 * GET /api/remote/servers/:id/git/status
 * Git 상태 조회
 */
router.get('/servers/:id/git/status', async (req, res) => {
  try {
    const server = await getRemoteServerById(req.params.id)
    if (!server) {
      res.status(404).json({ error: 'Server not found' })
      return
    }

    const path = req.query.path as string
    if (!path) {
      res.status(400).json({ error: 'Path is required' })
      return
    }

    const status = await getGitStatus(server, path)
    res.json(status)
  } catch (err) {
    console.error('[Remote] Failed to get git status:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to get git status' })
  }
})

/**
 * POST /api/remote/servers/:id/git/pull
 * Git pull 실행
 */
router.post('/servers/:id/git/pull', async (req, res) => {
  try {
    const server = await getRemoteServerById(req.params.id)
    if (!server) {
      res.status(404).json({ error: 'Server not found' })
      return
    }

    const { path } = req.body as { path: string }
    if (!path) {
      res.status(400).json({ error: 'Path is required' })
      return
    }

    const result = await gitPull(server, path)
    res.json(result)
  } catch (err) {
    console.error('[Remote] Git pull failed:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Git pull failed' })
  }
})

/**
 * POST /api/remote/servers/:id/git/push
 * Git push 실행
 */
router.post('/servers/:id/git/push', async (req, res) => {
  try {
    const server = await getRemoteServerById(req.params.id)
    if (!server) {
      res.status(404).json({ error: 'Server not found' })
      return
    }

    const { path } = req.body as { path: string }
    if (!path) {
      res.status(400).json({ error: 'Path is required' })
      return
    }

    const result = await gitPush(server, path)
    res.json(result)
  } catch (err) {
    console.error('[Remote] Git push failed:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Git push failed' })
  }
})

// ============================================
// 원격 프로젝트 관리 API
// ============================================

/**
 * POST /api/remote/projects
 * 원격 프로젝트 추가
 */
router.post('/projects', async (req, res) => {
  try {
    const body = req.body as AddRemoteProjectRequest

    if (!body.serverId || !body.name || !body.path) {
      res.status(400).json({ error: 'Missing required fields: serverId, name, path' })
      return
    }

    // 서버 존재 확인
    const server = await getRemoteServerById(body.serverId)
    if (!server) {
      res.status(404).json({ error: 'Server not found' })
      return
    }

    // 경로 존재 확인
    const pathExists = await exists(server, body.path)
    if (!pathExists) {
      res.status(400).json({ error: `Path does not exist on remote server: ${body.path}` })
      return
    }

    // openspec 디렉토리 확인 (optional)
    const openspecExists = await exists(server, `${body.path}/openspec`)

    const project = await addRemoteProject(body.serverId, body.name, body.path)

    res.json({
      project,
      hasOpenspec: openspecExists,
    })
  } catch (err) {
    console.error('[Remote] Failed to add remote project:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to add project' })
  }
})

/**
 * GET /api/remote/projects
 * 원격 프로젝트 목록 (remote 속성이 있는 것만)
 */
router.get('/projects', async (_req, res) => {
  try {
    const config = await loadIntegratedConfig()
    const remoteProjects = config.projects.filter((p) => p.remote)

    res.json({ projects: remoteProjects })
  } catch (err) {
    console.error('[Remote] Failed to list remote projects:', err)
    res.status(500).json({ error: 'Failed to list remote projects' })
  }
})

export default router
