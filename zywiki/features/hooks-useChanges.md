<cite>src/hooks/useChanges.ts</cite>

**개요**
`useChanges` 훅은 React 컴포넌트 내에서 특정 값의 변화를 효율적으로 감지하고 추적하기 위해 설계되었습니다. 이 훅은 현재 값, 이전 값, 그리고 두 값의 변경 여부를 제공하여, 개발자가 값의 상태 변화에 따라 로직을 실행하거나 UI를 업데이트할 수 있도록 돕습니다. 복잡한 수동 비교 로직 없이 값의 변경 이력을 간편하게 관리하는 데 유용합니다.

**Mermaid 다이어그램**

```mermaid
graph TD
    A[React Component] --> B{useChanges(value, initialValue?)};
    B -- 현재 값 저장 --> C[useState(value)];
    B -- 이전 값 저장 --> D[useRef(initialValue || value)];
    B -- 값 변경 감지 및 업데이트 --> E[useEffect];
    E -- `value` 변경 시 --> D;
    B --> F{return [currentValue, previousValue, hasChanged]};
```
*   **다이어그램 1: 아키텍처 개요**
    `useChanges` 훅이 React 컴포넌트 내에서 어떻게 동작하는지 보여줍니다. 컴포넌트는 `useChanges`에 추적할 `value`와 선택적으로 `initialValue`를 전달합니다. 훅 내부에서는 `useState`로 현재 값을, `useRef`로 이전 값을 관리하며, `useEffect`를 통해 `value`가 변경될 때 `useRef`에 저장된 이전 값을 업데이트합니다. 최종적으로 현재 값, 이전 값, 그리고 변경 여부를 반환하여 컴포넌트에서 활용할 수 있게 합니다.

```mermaid
graph LR
    subgraph Component Render Cycle
        A[Input Value: T] --> B{useChanges(value, initialValue?)};
    end

    subgraph useChanges Internal Logic
        B --> C[const [current, setCurrent] = useState(value)];
        B --> D[const previousRef = useRef(initialValue || value)];
        B --> E[const hasChanged = !Object.is(current, previousRef.current)];
        B --> F[useEffect(() => { previousRef.current = current; }, [current])];
    end

    C -- 현재 값 --> G[Output: current];
    D -- 이전 값 --> H[Output: previousRef.current];
    E -- 변경 여부 --> I[Output: hasChanged];
    F -- `current` 변경 시 --> D;
    G & H & I --> J[Return [current, previousRef.current, hasChanged]];
```
*   **다이어그램 2: 데이터 흐름**
    `useChanges` 훅 내부의 데이터 흐름을 상세하게 설명합니다. 입력된 `value`는 `useState`로 `current` 상태를 초기화하고, `useRef`로 `previousRef`를 초기화하는 데 사용됩니다. `Object.is`를 사용하여 `current`와 `previousRef.current`를 비교하여 `hasChanged` 불리언 값을 계산합니다. `useEffect`는 `current` 값이 변경될 때마다 `previousRef.current`를 `current`의 이전 값으로 업데이트하는 역할을 합니다. 이 모든 과정이 끝난 후 `[current, previousRef.current, hasChanged]` 튜플이 반환됩니다.

**주요 함수/클래스**

*   **`useChanges<T>(value: T, initialValue?: T): [T, T | undefined, boolean]`**
    *   **설명**:
        이 훅은 특정 `value`의 변화를 감지하고 추적하며, 그 변화에 대한 정보를 제공합니다. 반환 값은 `[현재 값, 이전 값, 변경 여부]`의 튜플 형태입니다. `value`는 추적하고자 하는 모든 타입의 데이터(원시 타입, 객체 등)가 될 수 있습니다. 변경 감지는 `Object.is` 비교를 사용하여 이루어지므로, 원시 값의 동일성 및 객체 참조의 동일성을 정확하게 확인합니다.
    *   **매개변수**:
        *   `value: T`: 현재 추적하고자 하는 값입니다. 이 값이 변경될 때마다 훅은 새로운 상태를 계산합니다.
        *   `initialValue?: T`: (선택 사항) 훅이 처음 마운트될 때 `previousValue`로 사용될 초기 값입니다. 이 값을 제공하지 않으면, 첫 렌더링 시 `previousValue`는 `undefined`가 됩니다.
    *   **반환 값**:
        *   `[currentValue: T, previousValue: T | undefined, hasChanged: boolean]`
            *   `currentValue`: 훅에 전달된 현재 `value`입니다.
            *   `previousValue`: `value`가 마지막으로 변경되기 전의 값입니다. 훅이 처음 마운트되고 `initialValue`가 제공되지 않은 경우 `undefined`입니다.
            *   `hasChanged`: `currentValue`가 `previousValue`와 다르면 `true`를 반환합니다. (첫 렌더링 시 `initialValue`가 없으면 `true`로 간주될 수 있습니다.)

**설정/사용법**

`useChanges` 훅을 사용하여 숫자 카운터의 변화를 추적하는 예제입니다.

```typescript
import React, { useState, useEffect } from 'react';
import { useChanges } from './src/hooks/useChanges'; // 실제 파일 경로에 맞게 조정

function CounterWithChangeTracker() {
  const [count, setCount] = useState(0);
  const [currentCount, previousCount, countHasChanged] = useChanges(count);

  useEffect(() => {
    if (countHasChanged) {
      console.log(`카운트가 변경되었습니다! 이전: ${previousCount}, 현재: ${currentCount}`);
    } else {
      console.log(`카운트는 변경되지 않았습니다. 현재: ${currentCount}`);
    }
  }, [currentCount, previousCount, countHasChanged]);

  return (
    <div>
      <h2>카운터 변화 추적기</h2>
      <p>
        현재 카운트: **{currentCount}**
      </p>
      <p>
        이전 카운트: **{previousCount === undefined ? '없음 (초기값)' : previousCount}**
      </p>
      <p>
        카운트 변경 여부: **{countHasChanged ? '변경됨' : '변경 없음'}**
      </p>
      <button onClick={() => setCount(prev => prev + 1)}>카운트 증가</button>
      <button onClick={() => setCount(0)}>카운트 초기화</button>
    </div>
  );
}

function UserProfileTracker() {
  const [user, setUser] = useState({ id: 1, name: 'Alice', age: 30 });
  // initialValue를 제공하여 첫 렌더링 시 previousUser가 undefined가 아니도록 설정
  const [currentUser, previousUser, userProfileHasChanged] = useChanges(user, { id: 0, name: 'Guest', age: 0 });

  const updateUserName = () => {
    // 새로운 객체 참조를 생성하여 변경을 감지하도록 함
    setUser(prev => ({ ...prev, name: prev.name === 'Alice' ? 'Bob' : 'Alice' }));
  };

  const updateUserAge = () => {
    // 새로운 객체 참조를 생성하여 변경을 감지하도록 함
    setUser(prev => ({ ...prev, age: prev.age + 1 }));
  };

  const resetUser = () => {
    // 완전히 새로운 객체 참조로 초기화
    setUser({ id: 1, name: 'Alice', age: 30 });
  };

  return (
    <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
      <h2>사용자 프로필 변화 추적</h2>
      <p>
        현재 사용자: **{JSON.stringify(currentUser)}**
      </p>
      <p>
        이전 사용자: **{previousUser ? JSON.stringify(previousUser) : '없음 (초기값)'}**
      </p>
      <p>
        프로필 변경 여부: **{userProfileHasChanged ? '변경됨' : '변경 없음'}**
      </p>
      <button onClick={updateUserName}>이름 변경</button>
      <button onClick={updateUserAge}>나이 증가</button>
      <button onClick={resetUser}>프로필 초기화</button>
      <p>
        *참고: 객체 참조가 변경될 때만 `userProfileHasChanged`가 `true`가 됩니다.
        `updateUserName`이나 `updateUserAge` 버튼을 누르면 새로운 객체 참조가 생성되므로,
        `userProfileHasChanged`는 `true`가 됩니다.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <div>
      <CounterWithChangeTracker />
      <UserProfileTracker />
    </div>
  );
}
```

**문제 해결 가이드**

1.  **첫 렌더링 시 `previousValue`가 `undefined`로 표시되는 문제**
    *   **증상**: 훅이 컴포넌트에 처음 마운트될 때 `previousValue`가 `undefined`로 반환되고, `hasChanged`는 `true`로 나올 수 있습니다.
    *   **원인**: `useChanges` 훅은 기본적으로 초기 마운트 시 이전 값을 알 수 없으므로 `undefined`를 반환합니다. 이는 의도된 동작입니다.
    *   **해결책**:
        1.  `useChanges` 훅의 두 번째 인자로 `initialValue`를 명시적으로 전달하여 초기 `previousValue`를 설정합니다.
            ```typescript
            const [current, previous, changed] = useChanges(myValue, '초기 상태');
            ```
        2.  UI에서 `previousValue`가 `undefined`일 때를 처리하는 로직을 추가하여 사용자에게 명확하게 표시합니다.
            ```typescript
            <p>이전 값: {previous === undefined ? '없음 (초기값)' : previous}</p>
            ```

2.  **객체나 배열의 내부 값 변경 시 `hasChanged`가 `false`로 유지되는 문제**
    *   **증상**: 객체나 배열의 속성(예: `user.name`, `arr[0]`)만 변경했는데도 `useChanges`의 `hasChanged`가 `false`로 반환됩니다.
    *   **원인**: `useChanges`는 내부적으로 `Object.is` 비교를 사용합니다. `Object.is`는 원시 값(숫자, 문자열 등)은 값을 비교하지만, 객체나 배열은 참조(reference)를 비교합니다. 따라서 객체나 배열의 내부 내용만 변경하고 해당 객체/배열의 참조가 동일하다면, `Object.is`는 변경을 감지하지 못하고 `false`를 반환합니다.
    *   **해결책**: React에서 상태를 업데이트할 때 불변성(immutability)을 유지하는 것이 중요합니다. 객체나 배열의 내용이 변경될 때는 항상 새로운 객체 또는 배열 참조를 생성해야 합니다.
        ```typescript
        // 잘못된 예: 기존 객체 참조를 변경 (hasChanged = false)
        const updateUser = () => {
          user.name = 'Bob'; // 객체의 속성을 직접 수정
          setUser(user); // 같은 참조 전달
        };

        // 올바른 예: 새로운 객체 참조 생성 (hasChanged = true)
        const updateUser = () => {
          setUser(prevUser => ({ ...prevUser, name: 'Bob' })); // 스프레드 연산자로 새로운 객체 생성
        };

        // 배열의 경우도 마찬가지
        const addToArray = () => {
          setMyArray(prevArray => [...prevArray, newItem]); // 새로운 배열 생성
        };
        ```
        새로운 참조를 생성하면 `useChanges` 훅이 이를 감지하고 `hasChanged`를 `true`로 올바르게 설정합니다.

3.  **복잡한 값 비교 시 성능 문제**
    *   **증상**: `useChanges`가 매우 크거나 깊게 중첩된 객체를 추적할 때, 애플리케이션의 성능이 저하되거나 불필요한 렌더링이 발생하는 것처럼 느껴질 수 있습니다.
    *   **원인**: `useChanges` 자체의 `Object.is` 비교는 일반적으로 빠르지만, `value` 자체가 매 렌더링마다 새로운 객체/배열로 재생성되거나, 훅의 반환 값이 다른 `useEffect`나 `useMemo`의 의존성 배열에 포함될 경우 불필요한 재계산이나 재실행을 유발할 수 있습니다.
    *   **해결책**:
        *   **추적 값 단순화**: 가능하면 추적할 `value`를 최소화하거나 원시 타입으로 단순화합니다. 객체 전체보다는 특정 속성만 추적하는 것을 고려합니다.
        *   **`useMemo` 활용**: `value`가 매 렌더링마다 불필요하게 새로운 객체/배열로 생성되는 것을 방지하기 위해 `useMemo`를 사용합니다.
            ```typescript
            const memoizedValue = useMemo(() => {
              // 복잡한 값 생성 로직
              return { data: someData, config: someConfig };
            }, [someData, someConfig]); // 의존성이 변경될 때만 memoizedValue 재생성

            const [current, previous, changed] = useChanges(memoizedValue);
            ```
        *   **의존성 배열 최적화**: `useChanges`의 반환 값(`[currentValue, previousValue, hasChanged]`)을 다른 훅의 의존성 배열에 사용할 때는, 실제로 필요한 요소만 포함하여 불필요한 재실행을 방지합니다. 예를 들어, 변경 여부만 중요하다면 `[hasChanged]`만 의존성에 추가합니다.
        *   **프로파일링**: React 개발자 도구를 사용하여 어떤 부분이 성능 저하의 주범인지 프로파일링하여 정확한 병목 지점을 찾습니다.