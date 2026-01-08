/**
 * ZyFlow MCP 서버를 Claude Code 플러그인용으로 번들링하는 스크립트
 *
 * 사용법: npx tsx scripts/build-plugin.ts
 */

import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const PLUGIN_DIR = join(ROOT_DIR, 'plugin');

// 색상 출력 헬퍼
const log = {
  info: (msg: string) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  success: (msg: string) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  error: (msg: string) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
  warn: (msg: string) => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`),
};

async function buildPlugin() {
  const startTime = Date.now();

  log.info('ZyFlow 플러그인 빌드 시작...');

  // 1. plugin 디렉토리 초기화
  log.info('plugin 디렉토리 초기화...');
  if (existsSync(PLUGIN_DIR)) {
    rmSync(PLUGIN_DIR, { recursive: true });
  }
  mkdirSync(join(PLUGIN_DIR, 'scripts'), { recursive: true });

  // 2. MCP 서버 번들링
  log.info('MCP 서버 번들링 (esbuild)...');
  try {
    await esbuild.build({
      entryPoints: [join(ROOT_DIR, 'mcp-server/index.ts')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: join(PLUGIN_DIR, 'scripts/mcp-server.cjs'),
      external: [
        'better-sqlite3',    // 네이티브 모듈
        '@lancedb/lancedb',  // 네이티브 모듈
        'node-pty',          // 네이티브 모듈
        'ssh2',              // 네이티브 모듈
      ],
      sourcemap: false,
      minify: false,  // 디버깅을 위해 minify 비활성화
      logLevel: 'info',
      // 환경 변수 처리
      define: {
        'process.env.NODE_ENV': '"production"',
      },
    });
    log.success('MCP 서버 번들링 완료');
  } catch (error) {
    log.error('MCP 서버 번들링 실패');
    console.error(error);
    process.exit(1);
  }

  // 3. Skills 복사
  const skillsSource = join(ROOT_DIR, '.claude/skills/openspec');
  const skillsDest = join(PLUGIN_DIR, 'skills/openspec');
  if (existsSync(skillsSource)) {
    log.info('Skills 복사...');
    mkdirSync(dirname(skillsDest), { recursive: true });
    cpSync(skillsSource, skillsDest, { recursive: true });
    log.success('Skills 복사 완료');
  } else {
    log.warn('Skills 폴더 없음 - 건너뜀');
  }

  // 4. Commands 복사
  const commandsSource = join(ROOT_DIR, '.claude/commands/openspec');
  const commandsDest = join(PLUGIN_DIR, 'commands/openspec');
  if (existsSync(commandsSource)) {
    log.info('Commands 복사...');
    mkdirSync(dirname(commandsDest), { recursive: true });
    cpSync(commandsSource, commandsDest, { recursive: true });
    log.success('Commands 복사 완료');
  } else {
    log.warn('Commands 폴더 없음 - 건너뜀');
  }

  // 5. Agents 복사
  const agentsSource = join(ROOT_DIR, '.claude/agents/core');
  const agentsDest = join(PLUGIN_DIR, 'agents');
  if (existsSync(agentsSource)) {
    log.info('Agents 복사...');
    mkdirSync(agentsDest, { recursive: true });
    cpSync(agentsSource, agentsDest, { recursive: true });
    log.success('Agents 복사 완료');
  } else {
    log.warn('Agents 폴더 없음 - 건너뜀');
  }

  // 6. plugin/package.json 생성 (네이티브 모듈 의존성)
  log.info('plugin/package.json 생성...');
  const pluginPackageJson = {
    name: 'zyflow-plugin',
    version: '1.0.0',
    private: true,
    description: 'ZyFlow MCP Server Plugin',
    type: 'commonjs',
    dependencies: {
      'better-sqlite3': '^12.4.6',
    },
    engines: {
      node: '>=18.0.0',
    },
  };
  writeFileSync(
    join(PLUGIN_DIR, 'package.json'),
    JSON.stringify(pluginPackageJson, null, 2)
  );
  log.success('plugin/package.json 생성 완료');

  // 완료 메시지
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n' + '='.repeat(50));
  log.success(`플러그인 빌드 완료! (${elapsed}s)`);
  console.log('='.repeat(50));
  console.log('\n빌드 결과:');
  console.log(`  📁 ${PLUGIN_DIR}`);
  console.log('  ├── scripts/mcp-server.cjs');
  console.log('  ├── skills/');
  console.log('  ├── commands/');
  console.log('  ├── agents/');
  console.log('  └── package.json');
  console.log('\n다음 단계:');
  console.log('  1. cd plugin && npm install');
  console.log('  2. Claude Code에서: /plugins install /Users/hansoo./ZELLYY/zyflow');
  console.log('  3. /mcp 로 연결 확인\n');
}

buildPlugin().catch((error) => {
  log.error('빌드 실패');
  console.error(error);
  process.exit(1);
});
