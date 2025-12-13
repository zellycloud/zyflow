/**
 * Quarantine Manager
 *
 * 미사용 코드를 .quarantine/ 폴더로 격리하고 관리합니다.
 */

import { randomUUID } from 'crypto';
import { join, dirname, basename, relative } from 'path';
import {
  readFile,
  writeFile,
  readdir,
  mkdir,
  rename,
  unlink,
  rm,
  access,
  stat,
} from 'fs/promises';
import type {
  QuarantineManifest,
  QuarantineItem,
  QuarantineStatus,
  QuarantinePolicy,
} from './post-task-types.js';
import { DEFAULT_QUARANTINE_POLICY } from './post-task-types.js';

/**
 * 격리 디렉토리 이름
 */
const QUARANTINE_DIR = '.quarantine';

/**
 * Quarantine Manager 클래스
 */
export class QuarantineManager {
  private projectPath: string;
  private policy: QuarantinePolicy;

  constructor(projectPath: string, policy?: Partial<QuarantinePolicy>) {
    this.projectPath = projectPath;
    this.policy = { ...DEFAULT_QUARANTINE_POLICY, ...policy };
  }

  /**
   * 격리 디렉토리 경로
   */
  private get quarantineDir(): string {
    return join(this.projectPath, QUARANTINE_DIR);
  }

  /**
   * 오늘 날짜의 격리 디렉토리
   */
  private getTodayDir(): string {
    const today = new Date().toISOString().split('T')[0];
    return join(this.quarantineDir, today);
  }

  /**
   * 매니페스트 파일 경로
   */
  private getManifestPath(dateDir: string): string {
    return join(dateDir, 'manifest.json');
  }

  /**
   * 파일 존재 확인
   */
  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 매니페스트 읽기
   */
  private async readManifest(dateDir: string): Promise<QuarantineManifest | null> {
    const manifestPath = this.getManifestPath(dateDir);

    try {
      const content = await readFile(manifestPath, 'utf-8');
      return JSON.parse(content) as QuarantineManifest;
    } catch {
      return null;
    }
  }

  /**
   * 매니페스트 저장
   */
  private async writeManifest(
    dateDir: string,
    manifest: QuarantineManifest
  ): Promise<void> {
    const manifestPath = this.getManifestPath(dateDir);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  /**
   * 파일 격리
   */
  async quarantine(
    filePath: string,
    reason: string,
    detectedBy: string,
    confidence: 'high' | 'medium' | 'low' = 'medium'
  ): Promise<QuarantineItem> {
    const absolutePath = join(this.projectPath, filePath);
    const todayDir = this.getTodayDir();

    // 격리 디렉토리 생성
    await mkdir(todayDir, { recursive: true });

    // 격리 경로 계산 (원본 디렉토리 구조 유지)
    const relativePath = relative(this.projectPath, absolutePath);
    const quarantinedPath = join(todayDir, relativePath);

    // 격리 항목 생성
    const item: QuarantineItem = {
      id: randomUUID(),
      original: relativePath,
      quarantined: relative(this.projectPath, quarantinedPath),
      reason,
      detectedBy,
      confidence,
    };

    // Git 히스토리에서 마지막 사용일 추출 시도
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const { stdout } = await execAsync(
        `git log -1 --format=%cI -- "${filePath}"`,
        { cwd: this.projectPath }
      );
      if (stdout.trim()) {
        item.lastUsed = stdout.trim();
      }
    } catch {
      // Git 명령 실패 시 무시
    }

    // 파일 이동
    await mkdir(dirname(quarantinedPath), { recursive: true });
    await rename(absolutePath, quarantinedPath);

    // 매니페스트 업데이트
    let manifest = await this.readManifest(todayDir);
    if (!manifest) {
      manifest = {
        date: new Date().toISOString().split('T')[0],
        reason: 'dead-code-cleanup',
        items: [],
      };
    }
    manifest.items.push(item);
    await this.writeManifest(todayDir, manifest);

    return item;
  }

  /**
   * 격리 파일 복구
   */
  async restore(itemId: string): Promise<{ success: boolean; message: string }> {
    // 모든 날짜 디렉토리 검색
    const dateDirs = await this.listDateDirs();

    for (const dateDir of dateDirs) {
      const manifest = await this.readManifest(dateDir);
      if (!manifest) continue;

      const itemIndex = manifest.items.findIndex((item) => item.id === itemId);
      if (itemIndex === -1) continue;

      const item = manifest.items[itemIndex];
      const quarantinedPath = join(this.projectPath, item.quarantined);
      const originalPath = join(this.projectPath, item.original);

      // 원본 경로에 이미 파일이 있는지 확인
      if (await this.fileExists(originalPath)) {
        return {
          success: false,
          message: `File already exists at original path: ${item.original}`,
        };
      }

      // 파일 복구
      await mkdir(dirname(originalPath), { recursive: true });
      await rename(quarantinedPath, originalPath);

      // 매니페스트 업데이트
      item.restoredAt = new Date().toISOString();
      await this.writeManifest(dateDir, manifest);

      return {
        success: true,
        message: `Restored ${item.original} from quarantine`,
      };
    }

    return {
      success: false,
      message: `Item not found: ${itemId}`,
    };
  }

  /**
   * 격리 파일 삭제
   */
  async delete(itemId: string): Promise<{ success: boolean; message: string }> {
    const dateDirs = await this.listDateDirs();

    for (const dateDir of dateDirs) {
      const manifest = await this.readManifest(dateDir);
      if (!manifest) continue;

      const itemIndex = manifest.items.findIndex((item) => item.id === itemId);
      if (itemIndex === -1) continue;

      const item = manifest.items[itemIndex];
      const quarantinedPath = join(this.projectPath, item.quarantined);

      // 파일 삭제
      try {
        await unlink(quarantinedPath);
      } catch {
        // 이미 삭제됨
      }

      // 매니페스트 업데이트
      item.deletedAt = new Date().toISOString();
      await this.writeManifest(dateDir, manifest);

      return {
        success: true,
        message: `Deleted ${item.original} from quarantine`,
      };
    }

    return {
      success: false,
      message: `Item not found: ${itemId}`,
    };
  }

  /**
   * 날짜 디렉토리 목록
   */
  private async listDateDirs(): Promise<string[]> {
    try {
      const entries = await readdir(this.quarantineDir, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
        .map((e) => join(this.quarantineDir, e.name))
        .sort()
        .reverse(); // 최신 날짜 먼저
    } catch {
      return [];
    }
  }

  /**
   * 격리 항목 목록
   */
  async list(options?: {
    status?: QuarantineStatus;
    date?: string;
  }): Promise<QuarantineItem[]> {
    const items: QuarantineItem[] = [];
    const dateDirs = await this.listDateDirs();

    for (const dateDir of dateDirs) {
      if (options?.date) {
        const dirDate = basename(dateDir);
        if (dirDate !== options.date) continue;
      }

      const manifest = await this.readManifest(dateDir);
      if (!manifest) continue;

      for (const item of manifest.items) {
        // 복구/삭제된 항목 제외
        if (item.restoredAt || item.deletedAt) continue;

        // 상태 필터
        if (options?.status) {
          const status = this.getItemStatus(manifest.date);
          if (status !== options.status) continue;
        }

        items.push(item);
      }
    }

    return items;
  }

  /**
   * 항목 상태 계산
   */
  private getItemStatus(dateStr: string): QuarantineStatus {
    const quarantineDate = new Date(dateStr);
    const now = new Date();
    const daysDiff = Math.floor(
      (now.getTime() - quarantineDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff >= this.policy.expireAfterDays) {
      return 'expired';
    }
    if (daysDiff >= this.policy.pendingAfterDays) {
      return 'pending';
    }
    return 'quarantined';
  }

  /**
   * 만료된 항목 정리
   */
  async cleanupExpired(): Promise<{ deleted: number; dirs: string[] }> {
    let deleted = 0;
    const deletedDirs: string[] = [];
    const dateDirs = await this.listDateDirs();

    for (const dateDir of dateDirs) {
      const dirDate = basename(dateDir);
      const status = this.getItemStatus(dirDate);

      if (status === 'expired') {
        const manifest = await this.readManifest(dateDir);
        if (!manifest) continue;

        // 자동 삭제 정책이 활성화된 경우에만 삭제
        if (this.policy.autoDelete) {
          // 전체 디렉토리 삭제
          await rm(dateDir, { recursive: true, force: true });
          deleted += manifest.items.filter((i) => !i.restoredAt && !i.deletedAt).length;
          deletedDirs.push(dirDate);
        }
      }
    }

    return { deleted, dirs: deletedDirs };
  }

  /**
   * 만료된 항목 목록 (삭제 확인용)
   */
  async listExpired(): Promise<{
    date: string;
    items: QuarantineItem[];
    daysOld: number;
  }[]> {
    const expired: { date: string; items: QuarantineItem[]; daysOld: number }[] = [];
    const dateDirs = await this.listDateDirs();
    const now = new Date();

    for (const dateDir of dateDirs) {
      const dirDate = basename(dateDir);
      const status = this.getItemStatus(dirDate);

      if (status === 'expired') {
        const manifest = await this.readManifest(dateDir);
        if (!manifest) continue;

        const activeItems = manifest.items.filter(
          (i) => !i.restoredAt && !i.deletedAt
        );

        if (activeItems.length > 0) {
          const quarantineDate = new Date(dirDate);
          const daysOld = Math.floor(
            (now.getTime() - quarantineDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          expired.push({
            date: dirDate,
            items: activeItems,
            daysOld,
          });
        }
      }
    }

    return expired;
  }

  /**
   * 통계 조회
   */
  async getStats(): Promise<{
    totalItems: number;
    byStatus: Record<QuarantineStatus, number>;
    byConfidence: Record<string, number>;
    oldestDate?: string;
    newestDate?: string;
  }> {
    const stats = {
      totalItems: 0,
      byStatus: { quarantined: 0, pending: 0, expired: 0 } as Record<
        QuarantineStatus,
        number
      >,
      byConfidence: { high: 0, medium: 0, low: 0 } as Record<string, number>,
      oldestDate: undefined as string | undefined,
      newestDate: undefined as string | undefined,
    };

    const dateDirs = await this.listDateDirs();

    for (const dateDir of dateDirs) {
      const dirDate = basename(dateDir);
      const manifest = await this.readManifest(dateDir);
      if (!manifest) continue;

      const activeItems = manifest.items.filter(
        (i) => !i.restoredAt && !i.deletedAt
      );

      if (activeItems.length === 0) continue;

      stats.totalItems += activeItems.length;

      const status = this.getItemStatus(dirDate);
      stats.byStatus[status] += activeItems.length;

      for (const item of activeItems) {
        stats.byConfidence[item.confidence] =
          (stats.byConfidence[item.confidence] || 0) + 1;
      }

      if (!stats.oldestDate || dirDate < stats.oldestDate) {
        stats.oldestDate = dirDate;
      }
      if (!stats.newestDate || dirDate > stats.newestDate) {
        stats.newestDate = dirDate;
      }
    }

    return stats;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultManager: QuarantineManager | null = null;

/**
 * 기본 Quarantine Manager 가져오기
 */
export function getQuarantineManager(
  projectPath?: string,
  policy?: Partial<QuarantinePolicy>
): QuarantineManager {
  if (!defaultManager || projectPath) {
    defaultManager = new QuarantineManager(
      projectPath || process.cwd(),
      policy
    );
  }
  return defaultManager;
}

/**
 * Quarantine Manager 리셋
 */
export function resetQuarantineManager(): void {
  defaultManager = null;
}
