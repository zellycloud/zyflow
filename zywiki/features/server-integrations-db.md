<cite>server/integrations/db/client.ts, server/integrations/db/schema.ts</cite>

## 개요

`server/integrations/db` 모듈은 서버 애플리케이션의 데이터베이스 접근을 중앙 집중화하고 관리하는 핵심 구성 요소입니다. 이 모듈은 데이터베이스 연결을 초기화하고 관리하며, 데이터 모델의 스키마를 정의하고, 모든 데이터베이스 쿼리 작업을 위한 인터페이스를 제공하는 역할을 합니다. 이를 통해 애플리케이션의 데이터 지속성 계층이 추상화되어 안정적이고 일관된 데이터베이스 상호작용을 보장합니다.

## 아키텍처 다이어그램

데이터베이스 통합 모듈이 서버 애플리케이션 내에서 어떻게 구성되고 외부 데이터베이스와 상호작용하는지를 보여줍니다.

```mermaid
graph TD
    A[서버 애플리케이션] --> B[server/integrations/db 모듈]
    B -- 정의 및 사용 --> C[server/integrations/db/schema.ts]
    B -- 초기화 및 관리 --> D[server/integrations/db/client.ts]
    D -- 연결 및 쿼리 --> E[데이터베이스 (예: PostgreSQL)]
    C -- 타입 정의 --> F[애플리케이션 도메인 모델]
```

## 데이터 흐름 다이어그램

클라이언트 요청부터 데이터베이스 응답까지 데이터가 시스템을 통해 어떻게 흐르는지 보여줍니다.

```mermaid
sequenceDiagram
    participant Client
    participant ServerAPI as 서버 API 레이어
    participant DBIntegration as server/integrations/db
    participant Database as 데이터베이스

    Client->>ServerAPI: 데이터 요청 (HTTP Request)
    ServerAPI->>DBIntegration: DB 함수 호출 (예: 사용자 조회)
    DBIntegration->>Database: 쿼리 실행 (SQL Query)
    Database-->>DBIntegration: 쿼리 결과 반환
    DBIntegration-->>ServerAPI: 처리된 데이터 반환
    ServerAPI-->>Client: 응답 전송 (HTTP Response)
```

## 의존성 다이어그램

`server/integrations/db` 모듈 내부의 주요 파일 간의 의존성 관계를 나타냅니다.

```mermaid
graph TD
    subgraph server/integrations/db
        A[client.ts] -- 초기화 및 사용 --> B[schema.ts 정의]
        A -- 관리 --> C[데이터베이스 연결 풀]
    end
    A --> D[외부 ORM/DB 드라이버 (예: PrismaClient)]
    B --> E[타입스크립트 타입 정의]
```

## 주요 함수/클래스

### `db`
*   **시그니처**: `PrismaClient` (또는 유사한 ORM 클라이언트 인스턴스)
*   **설명**: 데이터베이스 연결을 관리하고 모든 CRUD(Create, Read, Update, Delete) 작업을 수행하는 핵심 데이터베이스 클라이언트 인스턴스입니다. 이 인스턴스를 통해 모델에 접근하여 데이터를 조회, 생성, 수정, 삭제할 수 있습니다. 애플리케이션 전반에서 단일 인스턴스로 관리되어 효율적인 연결 풀링을 제공합니다.

### `connectDb()`
*   **시그니처**: `async function connectDb(): Promise<void>`
*   **설명**: 데이터베이스 연결을 초기화하고 설정합니다. 애플리케이션이 시작될 때 한 번 호출되어 데이터베이스와의 통신 채널을 확립합니다. 연결 실패 시 예외를 발생시키므로, 애플리케이션 시작 전에 연결 상태를 확인할 수 있습니다.

### `disconnectDb()`
*   **시그니처**: `async function disconnectDb(): Promise<void>`
*   **설명**: 애플리케이션 종료 시 데이터베이스 연결을 안전하게 종료합니다. 이 함수는 열려 있는 모든 데이터베이스 연결을 닫고, 진행 중인 트랜잭션을 정리하며, 리소스를 해제하여 데이터 무결성을 보장하고 메모리 누수를 방지합니다.

### `User`
*   **시그니처**: `interface User { id: string; name: string; email: string; createdAt: Date; updatedAt: Date; }` (예시)
*   **설명**: 사용자 데이터 모델의 구조를 정의하는 TypeScript 인터페이스 또는 타입입니다. `schema.ts` 파일에서 정의되며, 데이터베이스의 `User` 테이블과 직접 매핑되어 애플리케이션 코드에서 타입 안정성을 제공합니다.

### `Post`
*   **시그니처**: `interface Post { id: string; title: string; content: string; authorId: string; createdAt: Date; updatedAt: Date; }` (예시)
*   **설명**: 게시물 데이터 모델의 구조를 정의하는 TypeScript 인터페이스 또는 타입입니다. `schema.ts` 파일에서 정의되며, 데이터베이스의 `Post` 테이블과 매핑됩니다. `authorId` 필드를 통해 `User` 모델과 관계를 가질 수 있습니다.

## 설정/사용법

### 1. 데이터베이스 클라이언트 초기화 및 연결

`server/integrations/db/client.ts` 파일은 데이터베이스 클라이언트를 초기화하고 연결 및 해제 함수를 내보냅니다.

```typescript
// server/integrations/db/client.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const db = prisma;

export async function connectDb() {
  try {
    await prisma.$connect();
    console.log('데이터베이스 연결 성공.');
  } catch (error) {
    console.error('데이터베이스 연결 실패:', error);
    process.exit(1); // 연결 실패 시 애플리케이션 종료
  }
}

export async function disconnectDb() {
  await prisma.$disconnect();
  console.log('데이터베이스 연결 해제.');
}
```

### 2. 애플리케이션에서 데이터베이스 사용

서버의 메인 애플리케이션 진입점이나 서비스 레이어에서 `db` 클라이언트를 가져와 데이터베이스 작업을 수행합니다.

```typescript
// server/index.ts (애플리케이션 메인 파일 예시)
import { db, connectDb, disconnectDb } from './integrations/db/client';
import { User, Post } from './integrations/db/schema'; // 스키마 타입 사용 예시

async function bootstrap() {
  await connectDb(); // 애플리케이션 시작 시 데이터베이스 연결

  // 새 사용자 생성 예시
  try {
    const newUser: User = await db.user.create({
      data: {
        name: '김철수',
        email: 'chulsu.kim@example.com',
      },
    });
    console.log('새 사용자 생성:', newUser);

    // 모든 사용자 조회 예시
    const allUsers: User[] = await db.user.findMany();
    console.log('모든 사용자:', allUsers);

    // 특정 사용자의 게시물 생성 예시
    const newPost: Post = await db.post.create({
      data: {
        title: '첫 번째 게시물',
        content: '안녕하세요, 첫 게시물입니다!',
        authorId: newUser.id,
      },
    });
    console.log('새 게시물 생성:', newPost);

  } catch (error) {
    console.error('데이터베이스 작업 중 오류 발생:', error);
  } finally {
    // 애플리케이션 종료 시 데이터베이스 연결 해제 (예: 서버 종료 이벤트)
    // process.on('beforeExit', async () => {
    //   await disconnectDb();
    // });
  }
}

bootstrap();
```

## 문제 해결 가이드

### 1. 데이터베이스 연결 오류 (`Database connection failed`)
*   **증상**: 애플리케이션 시작 시 `데이터베이스 연결 실패` 메시지와 함께 종료되거나, 쿼리 실행 시 연결 관련 에러가 발생합니다.
*   **원인**: 환경 변수(`DATABASE_URL` 등) 설정 오류, 데이터베이스 서버가 실행 중이지 않음, 네트워크 방화벽 문제, 데이터베이스 접속 권한 부족 등이 있습니다.
*   **해결책**:
    1.  `.env` 파일에 `DATABASE_URL`이 올바르게 설정되어 있는지 확인합니다. (예: `postgresql://user:password@host:port/database?schema=public`)
    2.  데이터베이스 서버가 활성화되어 있고, 지정된 포트에서 수신 대기 중인지 확인합니다.
    3.  서버와 데이터베이스 간의 네트워크 경로에 방화벽이 있다면, 해당 포트(예: PostgreSQL의 5432)가 열려 있는지 확인합니다.
    4.  데이터베이스 사용자 이름과 비밀번호가 올바른지, 해당 사용자가 지정된 데이터베이스에 대한 접근 권한을 가지고 있는지 확인합니다.

### 2. 스키마 불일치 오류 (`Table '...' does not exist`)
*   **증상**: 코드에서 특정 모델을 사용하려 할 때, 해당 테이블이나 컬럼이 데이터베이스에 존재하지 않는다는 오류가 발생합니다.
*   **원인**: `server/integrations/db/schema.ts` (또는 원본 스키마 파일)가 변경되었지만, 데이터베이스에 해당 변경 사항이 마이그레이션되지 않았거나, ORM 클라이언트가 최신 스키마를 반영하도록 재생성되지 않았을 수 있습니다.
*   **해결책**:
    1.  `schema.prisma` 파일(Prisma를 사용하는 경우)을 수정한 후, `npx prisma migrate dev` 명령어를 실행하여 데이터베이스 스키마를 업데이트합니다.
    2.  마이그레이션 후, `npx prisma generate` 명령어를 실행하여 ORM 클라이언트(예: `@prisma/client`)가 최신 스키마를 반영하도록 재생성합니다.
    3.  `server/integrations/db/schema.ts` 파일이 ORM 클라이언트에서 생성된 타입을 정확히 참조하고 있는지 확인합니다.

### 3. 느린 쿼리 또는 성능 저하
*   **증상**: 특정 데이터베이스 작업(조회, 삽입 등)이 예상보다 오래 걸리거나, 서버 응답 시간이 전반적으로 느려집니다.
*   **원인**: 적절한 인덱스 부재, N+1 쿼리 문제, 대용량 데이터 조회, 복잡한 조인 쿼리 등이 있습니다.
*   **해결책**:
    1.  **인덱싱**: 자주 조회되거나 `WHERE` 절에 사용되는 컬럼에 데이터베이스 인덱스를 추가합니다.
    2.  **N+1 쿼리 방지**: 관련된 데이터를 함께 조회할 때 ORM의 `include` 또는 `populate` 기능을 사용하여 한 번의 쿼리로 데이터를 가져옵니다. (예: `db.user.findMany({ include: { posts: true } })`)
    3.  **쿼리 최적화**: ORM이 생성하는 SQL 쿼리를 확인하여 비효율적인 부분을 파악하고, 필요한 경우 원시 SQL 쿼리를 사용하거나 쿼리 빌더를 통해 최적화합니다.
    4.  **페이지네이션/제한**: 대용량 데이터를 한 번에 가져오기보다 `take`와 `skip` (또는 `limit`, `offset`)을 사용하여 데이터를 분할하여 가져옵니다.