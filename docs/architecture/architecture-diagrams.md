# 아키텍처 다이어그램 및 데이터 흐름 시각화

## 개요

ZyFlow 단일 진실 원천 아키텍처의 복잡한 컴포넌트 간의 관계와 데이터 흐름을 시각화하여 시스템의 동작 방식을 명확하게 이해할 수 있도록 합니다. 이 다이어그램들은 개발자, 시스템 관리자, 및 이해관계자들이 아키텍처를 쉽게 파악할 수 있도록 돕습니다.

## 전체 아키텍처 다이어그램

### 1. 시스템 전체 구조도

```mermaid
graph TB
    subgraph "사용자 인터페이스 계층"
        UI[Web UI]
        CLI[CLI 도구]
        MCP[MCP 서버]
    end
    
    subgraph "API 게이트웨이 계층"
        GW[API Gateway]
        AUTH[인증 미들웨어]
    end
    
    subgraph "애플리케이션 계층"
        APP[ZyFlow 애플리케이션]
        
        subgraph "커맨드 핸들러"
            CH[Command Handlers]
            QH[Query Handlers]
        end
        
        subgraph "서비스 계층"
            SC[Sync Coordinator]
            CM[Change Manager]
            TM[Task Manager]
        end
    end
    
    subgraph "이벤트 시스템"
        EB[Event Bus]
        ES[Event Store]
        
        subgraph "이벤트 프로세서"
            EP[Event Processors]
            ER[Event Replay Engine]
        end
    end
    
    subgraph "상태 관리"
        SM[State Manager]
        MVCC[MVCC Controller]
        LOCK[Lock Manager]
    end
    
    subgraph "데이터 저장소"
        subgraph "진실 원천"
            SPEC[Spec Store<br/>tasks.md 파일]
            DB[Runtime DB<br/>SQLite]
        end
        
        subgraph "이벤트 저장"
            EVENT_DB[Event Database]
            SNAP[Snapshot Store]
        end
        
        subgraph "캐시"
            L1[L1 Cache<br/>Memory]
            L2[L2 Cache<br/>Redis]
        end
    end
    
    subgraph "복구 시스템"
        RM[Recovery Manager]
        CB[Circuit Breakers]
        HC[Health Checker]
        BK[Backup Manager]
    end
    
    subgraph "모니터링"
        MON[Monitoring System]
        MET[Metrics Collector]
        ALERT[Alert Manager]
    end
    
    %% 데이터 흐름
    UI --> GW
    CLI --> GW
    MCP --> GW
    
    GW --> AUTH
    GW --> APP
    
    APP --> CH
    APP --> QH
    CH --> SC
    CH --> CM
    CH --> TM
    
    SC --> EB
    CM --> EB
    TM --> EB
    
    EB --> ES
    EB --> EP
    EB --> ER
    
    EP --> SM
    ER --> SM
    
    SM --> MVCC
    SM --> LOCK
    
    SM --> SPEC
    SM --> DB
    
    ES --> EVENT_DB
    ES --> SNAP
    
    MVCC --> L1
    MVCC --> L2
    
    RM --> CB
    RM --> HC
    RM --> BK
    
    MON --> MET
    MON --> ALERT
    
    %% 모니터링 연결
    APP --> MON
    EB --> MON
    SM --> MON
    RM --> MON
```

### 2. 데이터 흐름 다이어그램

```mermaid
graph LR
    subgraph "명세서 (Spec) 영역"
        A1[tasks.md 파일]
        A2[File Watcher]
        A3[Parser]
    end
    
    subgraph "실행 상태 (Runtime) 영역"
        B1[SQLite DB]
        B2[State Manager]
        B3[Query Handlers]
    end
    
    subgraph "이벤트 시스템"
        C1[Event Bus]
        C2[Event Store]
        C3[Event Processors]
    end
    
    subgraph "동기화 코디네이터"
        D1[Conflict Detector]
        D2[Conflict Resolver]
        D3[Sync Engine]
    end
    
    %% 정상 동기화 흐름
    A1 --> A2
    A2 --> A3
    A3 --> D1
    D1 --> D2
    D2 --> D3
    D3 --> B1
    D3 --> B2
    
    %% 이벤트 기반 흐름
    B1 --> C1
    B2 --> C1
    C1 --> C2
    C2 --> C3
    C3 --> B1
    C3 --> B2
    
    %% 역방향 동기화 흐름
    B1 --> D1
    B2 --> D1
    D1 --> D2
    D2 --> D3
    D3 --> A1
    
    %% 사용자 인터랙션 흐름
    UI --> B3
    UI --> A1
    CLI --> B3
    CLI --> A1
```

## 컴포넌트 상세 다이어그램

### 1. 동기화 코디네이터 상세 흐름

```mermaid
sequenceDiagram
    participant U as 사용자
    participant FW as File Watcher
    participant SC as Sync Coordinator
    participant CD as Conflict Detector
    participant CR as Conflict Resolver
    participant DB as Runtime DB
    participant FS as File System
    participant EB as Event Bus
    
    Note over U, FS: 사용자가 tasks.md 수정
    U->>FS: 파일 수정
    
    Note over FW, SC: 파일 변경 감지
    FS->>FW: 변경 이벤트
    FW->>SC: 동기화 요청
    
    Note over SC, DB: 현재 상태 조회
    SC->>DB: 현재 태스크 상태 조회
    DB-->>SC: 상태 데이터 반환
    
    Note over SC, CD: 충돌 감지
    SC->>CD: 충돌 분석 요청
    CD-->>SC: 충돌 목록 반환
    
    alt 충돌 발생
        Note over SC, CR: 충돌 해결
        SC->>CR: 자동 해결 시도
        CR-->>SC: 해결 결과
        
        alt 자동 해결 성공
            Note over SC, DB: 해결된 상태 적용
            SC->>DB: 충돌 해결된 데이터 적용
            SC->>EB: 충돌 해결 이벤트 발행
        else 자동 해결 실패
            Note over SC, U: 수동 개입 요청
            SC->>U: 충돌 해결 UI 표시
            U->>SC: 사용자 선택
            SC->>CR: 사용자 선택 적용
            CR-->>SC: 최종 해결 결과
            SC->>DB: 최종 데이터 적용
            SC->>FS: tasks.md 파일 업데이트
            SC->>EB: 충돌 해결 이벤트 발행
        end
    else 충돌 없음
        Note over SC, DB: 정상 동기화
        SC->>DB: 새로운 상태 적용
        SC->>EB: 동기화 완료 이벤트 발행
    end
    
    Note over EB: 이벤트 처리
    EB->>EB: 이벤트 핸들러에게 전달
```

### 2. 이벤트 기반 CQRS 흐름

```mermaid
graph TD
    subgraph "Command Side (쓰기)"
        C1[Command Handler]
        C2[Aggregate Root]
        C3[Event Store]
        C4[State Manager]
    end
    
    subgraph "Query Side (읽기)"
        Q1[Query Handler]
        Q2[Read Model]
        Q3[Cache]
        Q4[Event Store]
    end
    
    subgraph "Event Processing"
        E1[Event Bus]
        E2[Event Processor]
        E3[Event Replay]
        E4[Projection Builder]
    end
    
    %% Command 흐름
    C1 --> C2
    C2 --> C3
    C2 --> C4
    C3 --> E1
    
    %% Query 흐름
    Q1 --> Q2
    Q2 --> Q3
    Q2 --> Q4
    Q4 --> E1
    
    %% Event 처리 흐름
    E1 --> E2
    E2 --> E3
    E3 --> E4
    E4 --> Q2
```

### 3. 상태 관리 및 동시성 제어 흐름

```mermaid
graph TD
    subgraph "상태 관리 계층"
        SM1[State Manager]
        SM2[MVCC Controller]
        SM3[Lock Manager]
        SM4[Conflict Resolver]
    end
    
    subgraph "동시성 제어"
        CC1[Optimistic Lock]
        CC2[Version Check]
        CC3[Transaction Manager]
        CC4[Deadlock Detector]
    end
    
    subgraph "저장소 계층"
        ST1[Memory Store]
        ST2[Persistent Store]
        ST3[Event Store]
        ST4[Cache Layer]
    end
    
    %% 상태 수정 흐름
    SM1 --> CC2
    CC2 --> CC1
    CC1 --> CC3
    CC3 --> ST1
    CC3 --> ST2
    CC3 --> ST3
    
    %% 충돌 해결 흐름
    SM2 --> SM4
    SM4 --> CC1
    
    %% 롤백 흐름
    SM1 --> ST4
    ST4 --> SM1
```

### 4. 장애 격리 및 복구 흐름

```mermaid
graph TD
    subgraph "장애 감지"
        FD1[Failure Detector]
        FD2[Health Checker]
        FD3[Anomaly Detector]
        FD4[Circuit Breaker]
    end
    
    subgraph "격리 경계"
        IB1[Process Boundary]
        IB2[Service Boundary]
        IB3[Database Boundary]
        IB4[Network Boundary]
    end
    
    subgraph "복구 시스템"
        RS1[Recovery Manager]
        RS2[Auto Recovery Engine]
        RS3[Manual Recovery UI]
        RS4[Backup Manager]
    end
    
    subgraph "롤백 시스템"
        RB1[Rollback Points]
        RB2[State Snapshots]
        RB3[Transaction Log]
    end
    
    %% 장애 감지 흐름
    FD1 --> IB1
    FD2 --> IB2
    FD3 --> IB3
    FD4 --> IB4
    
    %% 격리 실행 흐름
    IB1 --> RS1
    IB2 --> RS1
    IB3 --> RS1
    IB4 --> RS1
    
    %% 복구 실행 흐름
    RS1 --> RS2
    RS2 --> RB1
    RS2 --> RB2
    RS2 --> RB3
    
    %% 수동 개입 흐름
    RS1 --> RS3
    RS3 --> RS2
    RS3 --> RS4
```

## 데이터 모델 관계도

### 1. 태스크 데이터 모델

```mermaid
erDiagram
    Task ||--o{ TaskGroup : belongs_to
    Task ||--o{ Change : part_of
    Task ||--o{ User : assigned_to
    Task ||--o{ Tag : tagged_with
    
    Task {
        string id
        string title
        string description
        enum status
        enum priority
        enum origin
        datetime created_at
        datetime updated_at
        datetime completed_at
        int version
        string checksum
    }
    
    TaskGroup {
        string id
        string title
        int order
        string major_title
        int sub_order
    }
    
    Change {
        string id
        string title
        string description
        enum status
        enum current_stage
        int progress
        datetime created_at
        datetime updated_at
    }
    
    User {
        string id
        string name
        string email
    }
    
    Tag {
        string id
        string name
        string color
    }
```

### 2. 이벤트 데이터 모델

```mermaid
erDiagram
    DomainEvent ||--o{ Aggregate : generated_by
    DomainEvent ||--o{ User : caused_by
    DomainEvent ||--o{ EventSnapshot : creates
    
    DomainEvent {
        string id
        string type
        string aggregate_id
        string aggregate_type
        int version
        datetime timestamp
        json data
        json metadata
    }
    
    Aggregate {
        string id
        string type
        int version
        json state
        datetime last_updated
    }
    
    EventSnapshot {
        string aggregate_id
        string aggregate_type
        int version
        json state_data
        datetime created_at
        string checksum
    }
    
    User {
        string id
        string name
        string email
    }
```

## 배포 아키텍처

### 1. 마이크로서비스 아키텍처

```mermaid
graph TB
    subgraph "로드 밸런서"
        LB[Load Balancer]
    end
    
    subgraph "API 서비스 클러스터"
        API1[API Server 1]
        API2[API Server 2]
        API3[API Server N]
    end
    
    subgraph "Sync 서비스 클러스터"
        SYNC1[Sync Service 1]
        SYNC2[Sync Service 2]
        SYNC3[Sync Service N]
    end
    
    subgraph "공유 저장소"
        REDIS[Redis Cache]
        DB[(PostgreSQL/MySQL)]
        EVENT[Event Store Cluster]
    end
    
    subgraph "파일 저장소"
        FS1[Shared File System 1]
        FS2[Shared File System 2]
        FS3[Shared File System N]
    end
    
    %% 로드 밸런싱
    LB --> API1
    LB --> API2
    LB --> API3
    
    %% 서비스 간 통신
    API1 --> REDIS
    API2 --> REDIS
    API3 --> REDIS
    
    API1 --> DB
    API2 --> DB
    API3 --> DB
    
    SYNC1 --> EVENT
    SYNC2 --> EVENT
    SYNC3 --> EVENT
    
    %% 파일 시스템 접근
    API1 --> FS1
    API2 --> FS2
    SYNC1 --> FS1
    SYNC2 --> FS2
```

### 2. 하이브리드 클라우드 아키텍처

```mermaid
graph TB
    subgraph "프론트엔드 (클라이언트)"
        WEB[Web Application]
        MOBILE[Mobile App]
        DESKTOP[Desktop App]
    end
    
    subgraph "API 게이트웨이"
        GW[API Gateway]
        CDN[CDN]
    end
    
    subgraph "클라우드 서비스"
        CLOUD_API[Cloud API Services]
        CLOUD_SYNC[Cloud Sync Services]
        CLOUD_EVENT[Cloud Event Processing]
    end
    
    subgraph "클라우드 저장소"
        CLOUD_DB[Cloud Database]
        CLOUD_CACHE[Cloud Cache]
        CLOUD_FILES[Cloud File Storage]
    end
    
    subgraph "온프레미스 저장소"
        ONPREM_DB[On-premise Database]
        ONPREM_FILES[Local File System]
    end
    
    %% 클라이언트 통신
    WEB --> GW
    MOBILE --> GW
    DESKTOP --> GW
    
    GW --> CDN
    GW --> CLOUD_API
    
    %% 서비스 간 통신
    CLOUD_API --> CLOUD_DB
    CLOUD_API --> CLOUD_CACHE
    CLOUD_SYNC --> CLOUD_FILES
    CLOUD_EVENT --> CLOUD_DB
    
    %% 하이브리드 동기화
    CLOUD_SYNC --> ONPREM_FILES
    CLOUD_EVENT --> ONPREM_DB
```

## 성능 최적화 다이어그램

### 1. 캐싱 전략

```mermaid
graph TD
    subgraph "다단계 캐시 아키텍처"
        L1[L1 Cache<br/>In-Memory<br/>1-10ms]
        L2[L2 Cache<br/>Redis<br/>10-50ms]
        L3[L3 Cache<br/>Database<br/>50-200ms]
    end
    
    subgraph "캐시 전략"
        WRITE_THROUGH[Write-Through]
        WRITE_BEHIND[Write-Behind]
        REFRESH_AHEAD[Refresh-Ahead]
        CACHE_ASIDE[Cache-Aside]
    end
    
    subgraph "캐시 무효화"
        TTL[TTL 기반 무효화]
        LRU[LRU eviction]
        WRITE_INVALIDATE[쓰기 시 무효화]
        MANUAL[수동 무효화]
    end
    
    %% 데이터 흐름
    L1 -.-> L2
    L2 -.-> L3
    
    WRITE_THROUGH --> L1
    WRITE_BEHIND --> L1
    REFRESH_AHEAD --> L1
    CACHE_ASIDE --> L2
```

### 2. 데이터베이스 최적화

```mermaid
graph TD
    subgraph "읽기 최적화"
        IDX1[Primary Indexes]
        IDX2[Secondary Indexes]
        IDX3[Composite Indexes]
        IDX4[Partial Indexes]
    end
    
    subgraph "쿼리 최적화"
        QRY1[Query Optimization]
        QRY2[Connection Pooling]
        QRY3[Prepared Statements]
        QRY4[Batch Processing]
    end
    
    subgraph "파티셔닝"
        PART1[Horizontal Partitioning]
        PART2[Vertical Partitioning]
        PART3[Range Partitioning]
        PART4[Hash Partitioning]
    end
    
    %% 인덱스 관계
    IDX1 --> QRY1
    IDX2 --> QRY1
    IDX3 --> QRY1
    IDX4 --> QRY1
    
    %% 최적화 적용
    QRY1 --> QRY2
    QRY2 --> QRY3
    QRY3 --> QRY4
    
    %% 파티셔닝 적용
    PART1 --> QRY1
    PART2 --> QRY1
    PART3 --> QRY1
    PART4 --> QRY1
```

## 모니터링 및 관찰 가능성

### 1. 모니터링 아키텍처

```mermaid
graph TD
    subgraph "메트릭 수집"
        APP_METRICS[Application Metrics]
        SYS_METRICS[System Metrics]
        DB_METRICS[Database Metrics]
        NET_METRICS[Network Metrics]
    end
    
    subgraph "로그 수집"
        APP_LOGS[Application Logs]
        ACCESS_LOGS[Access Logs]
        ERROR_LOGS[Error Logs]
        AUDIT_LOGS[Audit Logs]
    end
    
    subgraph "추적 시스템"
        TRACE[Distributed Tracing]
        SPAN[Span Collection]
        PROFILE[Performance Profiling]
    end
    
    subgraph "관찰 가능성"
        PROMETHEUS[Prometheus]
        GRAFANA[Grafana]
        JAEGER[Jaeger]
        ELK[ELK Stack]
    end
    
    %% 데이터 흐름
    APP_METRICS --> PROMETHEUS
    SYS_METRICS --> PROMETHEUS
    DB_METRICS --> PROMETHEUS
    NET_METRICS --> PROMETHEUS
    
    APP_LOGS --> ELK
    ACCESS_LOGS --> ELK
    ERROR_LOGS --> ELK
    AUDIT_LOGS --> ELK
    
    TRACE --> JAEGER
    SPAN --> JAEGER
    PROFILE --> JAEGER
    
    PROMETHEUS --> GRAFANA
    ELK --> GRAFANA
    JAEGER --> GRAFANA
```

### 2. 알림 시스템

```mermaid
graph TD
    subgraph "알림 소스"
        HEALTH[Health Checks]
        METRICS[Metrics Thresholds]
        MANUAL[Manual Triggers]
        EVENTS[Event Triggers]
    end
    
    subgraph "알림 채널"
        EMAIL[Email Notifications]
        SMS[SMS Notifications]
        SLACK[Slack Integration]
        WEBHOOK[Webhook Notifications]
        PUSH[Push Notifications]
    end
    
    subgraph "알림 관리"
        ROUTING[Alert Routing]
        ESCALATION[Escalation Policies]
        SUPPRESSION[Alert Suppression]
        SCHEDULED[Scheduled Alerts]
    end
    
    %% 알림 흐름
    HEALTH --> ROUTING
    METRICS --> ROUTING
    MANUAL --> ROUTING
    EVENTS --> ROUTING
    
    ROUTING --> EMAIL
    ROUTING --> SMS
    ROUTING --> SLACK
    ROUTING --> WEBHOOK
    ROUTING --> PUSH
    
    ROUTING --> ESCALATION
    ESCALATION --> EMAIL
    ESCALATION --> SMS
    ESCALATION --> SLACK
    
    ROUTING --> SUPPRESSION
    ROUTING --> SCHEDULED
```

## 결론

이 아키텍처 다이어그램들은 ZyFlow 단일 진실 원천 시스템의 복잡성을 시각적으로 표현하여 다음과 같은 이점들을 제공합니다:

1. **전체 시스템 구조**: 모든 컴포넌트 간의 관계와 의존성 명확화
2. **데이터 흐름**: 명세서와 실행 상태 간의 동기화 과정 상세화
3. **컴포넌트 상호작용**: 각 컴포넌트의 내부 동작 방식 시각화
4. **배포 전략**: 다양한 배포 환경에서의 아키텍처 적용 방안
5. **최적화 전략**: 성능 향상을 위한 다양한 최적화 기법 시각화
6. **모니터링 아키텍처**: 시스템 상태 모니터링과 알림 구조

이 다이어그램들은 개발팀이 시스템을 이해하고, 문제를 진단하며, 새로운 기능을 추가할 때 중요한 참고 자료로 활용될 것입니다.