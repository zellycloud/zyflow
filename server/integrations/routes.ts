import { Router, Request, Response } from 'express';
import {
  createServiceAccount,
  listServiceAccounts,
  getServiceAccount,
  getServiceAccountCredentials,
  updateServiceAccount,
  deleteServiceAccount,
  getAccountsByType,
} from './services/accounts.js';
import {
  getProjectIntegration,
  upsertProjectIntegration,
  setProjectService,
  listEnvironments,
  createEnvironment,
  updateEnvironment,
  deleteEnvironment,
  setActiveEnvironment,
  getEnvironmentVariables,
  listTestAccounts,
  createTestAccount,
  updateTestAccount,
  deleteTestAccount,
  getTestAccountPassword,
  getProjectContext,
} from './services/projects.js';
import {
  scanAndCacheProjectEnv,
  importServices,
  listEnvFiles,
  type ImportRequest,
} from './services/env-import.js';
import type { ServiceType, Credentials } from './db/schema.js';
// Local Settings imports
import {
  SettingsResolver,
  initLocalZyflow,
  hasLocalSettings,
} from './local/index.js';

const router = Router();

// =============================================
// 서비스 계정 API
// =============================================

/**
 * GET /api/integrations/accounts
 * 서비스 계정 목록 조회 (마스킹된 credentials)
 */
router.get('/accounts', async (req: Request, res: Response) => {
  try {
    const type = req.query.type as ServiceType | undefined;
    const accounts = await listServiceAccounts(type);
    res.json({ accounts });
  } catch (error) {
    console.error('Failed to list service accounts:', error);
    res.status(500).json({
      error: 'Failed to list service accounts',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/integrations/accounts
 * 서비스 계정 생성
 */
router.post('/accounts', async (req: Request, res: Response) => {
  try {
    const { type, name, credentials, metadata } = req.body;

    if (!type || !name || !credentials) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'type, name, and credentials are required',
      });
      return;
    }

    const validTypes: ServiceType[] = ['github', 'supabase', 'vercel', 'sentry', 'custom'];
    if (!validTypes.includes(type)) {
      res.status(400).json({
        error: 'Invalid service type',
        message: `type must be one of: ${validTypes.join(', ')}`,
      });
      return;
    }

    const account = await createServiceAccount(
      type as ServiceType,
      name,
      credentials as Credentials,
      metadata
    );

    res.status(201).json({ account });
  } catch (error) {
    console.error('Failed to create service account:', error);
    res.status(400).json({
      error: 'Failed to create service account',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/integrations/accounts/:id
 * 서비스 계정 단일 조회 (마스킹된 credentials)
 */
router.get('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const account = await getServiceAccount(id);

    if (!account) {
      res.status(404).json({
        error: 'Account not found',
        message: `No service account found with id: ${id}`,
      });
      return;
    }

    res.json({ account });
  } catch (error) {
    console.error('Failed to get service account:', error);
    res.status(500).json({
      error: 'Failed to get service account',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/integrations/accounts/:id/credentials
 * 서비스 계정 credentials 조회 (복호화된 원본 - 복사 기능용)
 */
router.get('/accounts/:id/credentials', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const credentials = await getServiceAccountCredentials(id);

    if (!credentials) {
      res.status(404).json({
        error: 'Account not found',
        message: `No service account found with id: ${id}`,
      });
      return;
    }

    res.json({ credentials });
  } catch (error) {
    console.error('Failed to get account credentials:', error);
    res.status(500).json({
      error: 'Failed to get account credentials',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/integrations/accounts/:id
 * 서비스 계정 수정
 */
router.put('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, credentials, metadata } = req.body;

    const account = await updateServiceAccount(id, {
      name,
      credentials,
      metadata,
    });

    if (!account) {
      res.status(404).json({
        error: 'Account not found',
        message: `No service account found with id: ${id}`,
      });
      return;
    }

    res.json({ account });
  } catch (error) {
    console.error('Failed to update service account:', error);
    res.status(400).json({
      error: 'Failed to update service account',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/integrations/accounts/:id
 * 서비스 계정 삭제
 */
router.delete('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await deleteServiceAccount(id);

    if (!deleted) {
      res.status(404).json({
        error: 'Account not found',
        message: `No service account found with id: ${id}`,
      });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete service account:', error);
    res.status(500).json({
      error: 'Failed to delete service account',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/integrations/accounts/type/:type
 * 서비스 타입별 계정 목록 (드롭다운용)
 */
router.get('/accounts/type/:type', async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const validTypes: ServiceType[] = ['github', 'supabase', 'vercel', 'sentry', 'custom'];

    if (!validTypes.includes(type as ServiceType)) {
      res.status(400).json({
        error: 'Invalid service type',
        message: `type must be one of: ${validTypes.join(', ')}`,
      });
      return;
    }

    const accounts = await getAccountsByType(type as ServiceType);
    res.json({ accounts });
  } catch (error) {
    console.error('Failed to get accounts by type:', error);
    res.status(500).json({
      error: 'Failed to get accounts by type',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================
// 프로젝트 연동 API
// =============================================

/**
 * GET /api/integrations/projects/:projectId
 * 프로젝트 연동 조회
 */
router.get('/projects/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const integration = await getProjectIntegration(projectId);

    res.json({ integration });
  } catch (error) {
    console.error('Failed to get project integration:', error);
    res.status(500).json({
      error: 'Failed to get project integration',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/integrations/projects/:projectId
 * 프로젝트 연동 설정
 */
router.put('/projects/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { integrations, defaultEnvironment } = req.body;

    const integration = await upsertProjectIntegration(
      projectId,
      integrations || {},
      defaultEnvironment
    );

    res.json({ integration });
  } catch (error) {
    console.error('Failed to update project integration:', error);
    res.status(500).json({
      error: 'Failed to update project integration',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/integrations/projects/:projectId/services/:serviceType
 * 프로젝트에 서비스 계정 연결
 */
router.put('/projects/:projectId/services/:serviceType', async (req: Request, res: Response) => {
  try {
    const { projectId, serviceType } = req.params;
    const { accountId } = req.body;

    const validTypes: ServiceType[] = ['github', 'supabase', 'vercel', 'sentry', 'custom'];
    if (!validTypes.includes(serviceType as ServiceType)) {
      res.status(400).json({
        error: 'Invalid service type',
        message: `serviceType must be one of: ${validTypes.join(', ')}`,
      });
      return;
    }

    const integration = await setProjectService(
      projectId,
      serviceType as ServiceType,
      accountId || null
    );

    res.json({ integration });
  } catch (error) {
    console.error('Failed to set project service:', error);
    res.status(500).json({
      error: 'Failed to set project service',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/integrations/projects/:projectId/context
 * 프로젝트 컨텍스트 조회 (AI용, 민감정보 제외)
 * 로컬 설정(.zyflow/)이 있으면 우선 사용
 * @query projectPath - 프로젝트 경로 (로컬 설정 조회용, 선택사항)
 */
router.get('/projects/:projectId/context', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const projectPath = req.query.projectPath as string | undefined;

    // 로컬 설정 우선 조회
    if (projectPath) {
      try {
        const resolver = new SettingsResolver(projectPath, projectId);
        const context = await resolver.getContext();
        res.json({
          context,
          source: context.source,
          sources: context.sources,
        });
        return;
      } catch {
        // 로컬 조회 실패 시 전역으로 fallback
      }
    }

    // 전역 DB에서 조회
    const context = await getProjectContext(projectId);
    res.json({
      context,
      source: 'global' as const,
    });
  } catch (error) {
    console.error('Failed to get project context:', error);
    res.status(500).json({
      error: 'Failed to get project context',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================
// 환경 설정 API
// =============================================

/**
 * GET /api/integrations/projects/:projectId/environments
 * 프로젝트 환경 목록 조회
 */
router.get('/projects/:projectId/environments', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const environments = await listEnvironments(projectId);

    res.json({ environments });
  } catch (error) {
    console.error('Failed to list environments:', error);
    res.status(500).json({
      error: 'Failed to list environments',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/integrations/projects/:projectId/environments
 * 환경 생성
 */
router.post('/projects/:projectId/environments', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { name, variables, serverUrl, databaseUrl, description, isActive } = req.body;

    if (!name || !variables) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'name and variables are required',
      });
      return;
    }

    const environment = await createEnvironment(projectId, name, variables, {
      serverUrl,
      databaseUrl,
      description,
      isActive,
    });

    res.status(201).json({ environment });
  } catch (error) {
    console.error('Failed to create environment:', error);
    res.status(400).json({
      error: 'Failed to create environment',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/integrations/projects/:projectId/environments/:envId
 * 환경 수정
 */
router.put('/projects/:projectId/environments/:envId', async (req: Request, res: Response) => {
  try {
    const { envId } = req.params;
    const { name, variables, serverUrl, databaseUrl, description } = req.body;

    const environment = await updateEnvironment(envId, {
      name,
      variables,
      serverUrl,
      databaseUrl,
      description,
    });

    if (!environment) {
      res.status(404).json({
        error: 'Environment not found',
        message: `No environment found with id: ${envId}`,
      });
      return;
    }

    res.json({ environment });
  } catch (error) {
    console.error('Failed to update environment:', error);
    res.status(400).json({
      error: 'Failed to update environment',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/integrations/projects/:projectId/environments/:envId
 * 환경 삭제
 */
router.delete('/projects/:projectId/environments/:envId', async (req: Request, res: Response) => {
  try {
    const { envId } = req.params;
    const deleted = await deleteEnvironment(envId);

    if (!deleted) {
      res.status(404).json({
        error: 'Environment not found',
        message: `No environment found with id: ${envId}`,
      });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete environment:', error);
    res.status(500).json({
      error: 'Failed to delete environment',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/integrations/projects/:projectId/environments/:envId/activate
 * 환경 활성화
 */
router.put('/projects/:projectId/environments/:envId/activate', async (req: Request, res: Response) => {
  try {
    const { projectId, envId } = req.params;
    await setActiveEnvironment(projectId, envId);

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to activate environment:', error);
    res.status(500).json({
      error: 'Failed to activate environment',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/integrations/projects/:projectId/environments/:envId/variables
 * 환경 변수 조회 (복호화된 원본)
 */
router.get('/projects/:projectId/environments/:envId/variables', async (req: Request, res: Response) => {
  try {
    const { envId } = req.params;
    const variables = await getEnvironmentVariables(envId);

    if (variables === null) {
      res.status(404).json({
        error: 'Environment not found',
        message: `No environment found with id: ${envId}`,
      });
      return;
    }

    res.json({ variables });
  } catch (error) {
    console.error('Failed to get environment variables:', error);
    res.status(500).json({
      error: 'Failed to get environment variables',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================
// 테스트 계정 API
// =============================================

/**
 * GET /api/integrations/projects/:projectId/test-accounts
 * 프로젝트 테스트 계정 목록 조회
 */
router.get('/projects/:projectId/test-accounts', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const accounts = await listTestAccounts(projectId);

    res.json({ accounts });
  } catch (error) {
    console.error('Failed to list test accounts:', error);
    res.status(500).json({
      error: 'Failed to list test accounts',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/integrations/projects/:projectId/test-accounts
 * 테스트 계정 생성
 */
router.post('/projects/:projectId/test-accounts', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { role, email, password, description } = req.body;

    if (!role || !email || !password) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'role, email, and password are required',
      });
      return;
    }

    const account = await createTestAccount(projectId, role, email, password, description);

    res.status(201).json({ account });
  } catch (error) {
    console.error('Failed to create test account:', error);
    res.status(400).json({
      error: 'Failed to create test account',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/integrations/projects/:projectId/test-accounts/:id
 * 테스트 계정 수정
 */
router.put('/projects/:projectId/test-accounts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role, email, password, description } = req.body;

    const account = await updateTestAccount(id, {
      role,
      email,
      password,
      description,
    });

    if (!account) {
      res.status(404).json({
        error: 'Test account not found',
        message: `No test account found with id: ${id}`,
      });
      return;
    }

    res.json({ account });
  } catch (error) {
    console.error('Failed to update test account:', error);
    res.status(400).json({
      error: 'Failed to update test account',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/integrations/projects/:projectId/test-accounts/:id
 * 테스트 계정 삭제
 */
router.delete('/projects/:projectId/test-accounts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await deleteTestAccount(id);

    if (!deleted) {
      res.status(404).json({
        error: 'Test account not found',
        message: `No test account found with id: ${id}`,
      });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete test account:', error);
    res.status(500).json({
      error: 'Failed to delete test account',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/integrations/projects/:projectId/test-accounts/:id/password
 * 테스트 계정 비밀번호 조회 (복호화된 원본 - 복사 기능용)
 */
router.get('/projects/:projectId/test-accounts/:id/password', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const password = await getTestAccountPassword(id);

    if (password === null) {
      res.status(404).json({
        error: 'Test account not found',
        message: `No test account found with id: ${id}`,
      });
      return;
    }

    res.json({ password });
  } catch (error) {
    console.error('Failed to get test account password:', error);
    res.status(500).json({
      error: 'Failed to get test account password',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================
// 환경변수 임포트 API
// =============================================

/**
 * GET /api/integrations/env/files
 * 프로젝트의 .env 파일 목록 조회
 */
router.get('/env/files', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.projectPath as string;

    if (!projectPath) {
      res.status(400).json({
        error: 'Missing required parameter',
        message: 'projectPath query parameter is required',
      });
      return;
    }

    const files = await listEnvFiles(projectPath);
    res.json({ files });
  } catch (error) {
    console.error('Failed to list env files:', error);
    res.status(500).json({
      error: 'Failed to list env files',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/integrations/env/scan
 * 프로젝트의 .env 파일 스캔 및 서비스 감지
 * @query projectPath - 프로젝트 경로 (필수)
 * @query files - 스캔할 파일 목록 (쉼표 구분, 선택사항 - 미지정시 모든 파일)
 */
router.get('/env/scan', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.projectPath as string;
    const filesParam = req.query.files as string | undefined;

    if (!projectPath) {
      res.status(400).json({
        error: 'Missing required parameter',
        message: 'projectPath query parameter is required',
      });
      return;
    }

    // 파일 목록 파싱 (쉼표 구분)
    const selectedFiles = filesParam
      ? filesParam.split(',').map(f => f.trim()).filter(Boolean)
      : undefined;

    const result = await scanAndCacheProjectEnv(projectPath, selectedFiles);
    res.json(result);
  } catch (error) {
    console.error('Failed to scan env files:', error);
    res.status(500).json({
      error: 'Failed to scan env files',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/integrations/env/import
 * 선택한 서비스를 Integration Hub에 등록
 */
router.post('/env/import', async (req: Request, res: Response) => {
  try {
    const { projectPath, services } = req.body as {
      projectPath: string;
      services: ImportRequest['services'];
    };

    if (!projectPath || !services || !Array.isArray(services)) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'projectPath and services array are required',
      });
      return;
    }

    if (services.length === 0) {
      res.status(400).json({
        error: 'No services selected',
        message: 'At least one service must be selected for import',
      });
      return;
    }

    const result = await importServices(projectPath, { services });
    res.json(result);
  } catch (error) {
    console.error('Failed to import services:', error);
    res.status(500).json({
      error: 'Failed to import services',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// =============================================
// 로컬 설정 API
// =============================================

/**
 * POST /api/integrations/local/init
 * 프로젝트에 .zyflow 디렉토리 초기화
 */
router.post('/local/init', async (req: Request, res: Response) => {
  try {
    const { projectPath } = req.body;

    if (!projectPath) {
      res.status(400).json({
        error: 'Missing required field',
        message: 'projectPath is required',
      });
      return;
    }

    const result = await initLocalZyflow(projectPath);
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Failed to initialize local settings:', error);
    res.status(500).json({
      error: 'Failed to initialize local settings',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/integrations/local/status
 * 프로젝트의 로컬 설정 상태 조회
 */
router.get('/local/status', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.projectPath as string;

    if (!projectPath) {
      res.status(400).json({
        error: 'Missing required parameter',
        message: 'projectPath query parameter is required',
      });
      return;
    }

    const hasLocal = await hasLocalSettings(projectPath);
    res.json({
      hasLocalSettings: hasLocal,
      projectPath,
    });
  } catch (error) {
    console.error('Failed to check local settings status:', error);
    res.status(500).json({
      error: 'Failed to check local settings status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
