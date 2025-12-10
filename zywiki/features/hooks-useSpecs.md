<cite>src/hooks/useSpecs.ts</cite>

## 훅 (Hooks) - Use Specs

### 개요

`useSpecs` 훅은 React 컴포넌트 내에서 복잡한 명세(specification)를 정의하고 관리하기 위한 강력한 도구입니다. 이 훅은 데이터 구조, 유효성 검사 규칙 또는 구성 설정을 선언적으로 명시하고, 이를 컴포넌트 라이프사이클에 맞춰 효율적으로 처리하며, 일관된 방식으로 명세에 접근하고 조작할 수 있도록 돕습니다. 이를 통해 코드의 가독성을 높이고, 개발자가 명세 관련 로직을 재사용 가능하게 하며, 잠재적인 오류를 줄이는 데 기여합니다.

### 아키텍처 다이어그램

```mermaid
graph TD
    A[React Component] --> B{useSpecs Hook};
    B --> C[Specification Object (initialSpecs)];
    B --> D[Options (e.g., validator, defaultValues)];
    B --> E[Processed Specs / Validation State / Utilities];
    E --> A;
    C -.-> B;
    D -.-> B;
```

### 데이터 흐름 다이어그램 (Spec Processing)

```mermaid
graph LR
    A[Raw Spec Input (initialSpecs)] --> B{useSpecs Hook};
    B -- Optional --> C{Apply Default Values (if provided)};
    C --> D{Validate Spec (using validator option)};
    D -- Valid --> E[Processed Spec Output];
    D -- Invalid --> F[Validation Errors];
    E --> G[Component Logic (e.g., display, submit)];
    F --> G[Component Logic (e.g., display error messages)];
    B -- Optional --> H[Validation Schema (passed via options)];
```

### 의존성 다이어그램 (Internal Dependencies)

```mermaid
graph TD
    A[useSpecs Hook] --> B[React.useState];
    A --> C[React.useMemo];
    A --> D[React.useCallback];
    A --> E[Validation Utility (e.g., Zod, Yup, or custom logic)];
    A --> F[Deep Merge Utility (for defaultValues)];
```

### 주요 함수/클래스

*   **`useSpecs<T extends object>(initialSpecs: T, options?: UseSpecsOptions)`**
    *   **설명**: `useSpecs`는 React 컴포넌트 내에서 명세 객체를 정의하고 관리하는 커스텀 훅입니다. `initialSpecs`로 초기 명세 객체를 받으며, 선택적으로 `options` 객체를 통해 명세의 유효성 검사 스키마, 기본값 병합 규칙 등을 설정할 수 있습니다. 이 훅은 내부적으로 `initialSpecs`를 기반으로 처리된 명세 객체와, 명세의 유효성 검사 상태 및 관련 유틸리티 함수들을 반환합니다. `useSpecs`는 명세가 변경될 때마다 효율적으로 재처리하고, 컴포넌트가 최신 상태의 명세에 접근할 수 있도록 보장합니다.
    *   **시그니처**:
        ```typescript
        interface UseSpecsOptions {
            /**
             * 명세 객체의 유효성을 검사하는 함수.
             * 유효성 검사 결과와 오류 메시지를 반환해야 합니다.
             */
            validator?: (spec: T) => { isValid: boolean; errors: Record<keyof T, string[]> };
            /**
             * 명세에 적용할 기본값 객체. initialSpecs와 병합됩니다.
             */
            defaultValues?: Partial<T>;
            /**
             * 유효성 검사 결과가 변경될 때 호출되는 콜백 함수.
             */
            onValidate?: (isValid: boolean, errors: Record<keyof T, string[]>) => void;
        }

        interface UseSpecsResult<T> {
            /**
             * 현재 관리되고 있는 명세 객체. 기본값 병합 및 유효성 검사가 적용된 최종 상태입니다.
             */
            specs: T;
            /**
             * 현재 명세 객체의 유효성 여부.
             */
            isValid: boolean;
            /**
             * 유효성 검사 실패 시 필드별 오류 메시지 객체.
             */
            errors: Record<keyof T, string[]>;
            /**
             * 명세 객체의 일부를 업데이트하는 함수. 불변성 유지를 위해 새로운 객체를 반환합니다.
             */
            updateSpec: (newSpec: Partial<T>) => void;
            /**
             * 명세 객체를 초기 상태(initialSpecs + defaultValues)로 재설정하는 함수.
             */
            resetSpecs: () => void;
        }

        function useSpecs<T extends object>(
            initialSpecs: T,
            options?: UseSpecsOptions
        ): UseSpecsResult<T>;
        ```

### 설정/사용법

1.  **기본적인 명세 정의 및 사용:**
    ```typescript
    import React from 'react';
    import { useSpecs } from './src/hooks/useSpecs'; // 실제 경로에 맞게 수정

    interface UserProfileSpecs {
        username: string;
        email: string;
        age: number;
        isActive: boolean;
    }

    const initialProfileSpecs: UserProfileSpecs = {
        username: 'john.doe',
        email: 'john.doe@example.com',
        age: 30,
        isActive: true,
    };

    function UserProfileEditor() {
        // useSpecs 훅을 사용하여 명세와 업데이트 함수를 가져옵니다.
        const { specs, updateSpec } = useSpecs(initialProfileSpecs);

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const { name, value, type, checked } = e.target;
            // updateSpec 함수를 사용하여 명세의 특정 필드를 업데이트합니다.
            updateSpec({
                [name]: type === 'checkbox' ? checked : value,
            } as Partial<UserProfileSpecs>);
        };

        return (
            <div>
                <h2>사용자 프로필</h2>
                <label>
                    이름:
                    <input
                        type="text"
                        name="username"
                        value={specs.username}
                        onChange={handleChange}
                    />
                </label>
                <label>
                    이메일:
                    <input
                        type="email"
                        name="email"
                        value={specs.email}
                        onChange={handleChange}
                    />
                </label>
                <label>
                    나이:
                    <input
                        type="number"
                        name="age"
                        value={specs.age}
                        onChange={handleChange}
                    />
                </label>
                <label>
                    활성:
                    <input
                        type="checkbox"
                        name="isActive"
                        checked={specs.isActive}
                        onChange={handleChange}
                    />
                </label>
                <pre>{JSON.stringify(specs, null, 2)}</pre>
            </div>
        );
    }

    export default UserProfileEditor;
    ```

2.  **유효성 검사 스키마와 함께 사용:**
    ```typescript
    import React from 'react';
    import { useSpecs } from './src/hooks/useSpecs'; // 실제 경로에 맞게 수정
    import * as Zod from 'zod'; // Zod 라이브러리 사용 가정

    // Zod를 사용하여 유효성 검사 스키마 정의
    const formSchema = Zod.object({
        title: Zod.string().min(5, "제목은 최소 5자 이상이어야 합니다."),
        content: Zod.string().min(20, "내용은 최소 20자 이상이어야 합니다."),
        category: Zod.enum(['기술', '일상', '리뷰'], {
            errorMap: () => ({ message: "유효한 카테고리를 선택하세요." })
        }),
    });

    type PostSpecs = Zod.infer<typeof formSchema>;

    const initialPostSpecs: PostSpecs = {
        title: '',
        content: '',
        category: '기술',
    };

    function PostForm() {
        const { specs, isValid, errors, updateSpec, resetSpecs } = useSpecs(initialPostSpecs, {
            // validator 옵션을 통해 Zod 스키마를 사용하여 유효성 검사 로직을 제공합니다.
            validator: (data) => {
                try {
                    formSchema.parse(data); // Zod 스키마로 데이터 파싱 시도
                    return { isValid: true, errors: {} as Record<keyof PostSpecs, string[]> };
                } catch (error: any) {
                    const fieldErrors: Record<keyof PostSpecs, string[]> = {} as Record<keyof PostSpecs, string[]>;
                    error.errors.forEach((err: any) => {
                        if (err.path.length > 0) {
                            const fieldName = err.path[0] as keyof PostSpecs;
                            fieldErrors[fieldName] = fieldErrors[fieldName] || [];
                            fieldErrors[fieldName].push(err.message);
                        }
                    });
                    return { isValid: false, errors: fieldErrors };
                }
            },
            // 유효성 검사 결과가 변경될 때마다 콘솔에 출력하는 콜백
            onValidate: (valid, errs) => {
                console.log('Validation status:', valid, 'Errors:', errs);
            }
        });

        const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
            const { name, value } = e.target;
            updateSpec({ [name]: value } as Partial<PostSpecs>);
        };

        const handleSubmit = (e: React.FormEvent) => {
            e.preventDefault();
            if (isValid) {
                alert('게시글 제출 성공: ' + JSON.stringify(specs, null, 2));
                resetSpecs(); // 제출 후 명세 초기화
            } else {
                alert('유효성 검사 실패! 오류를 확인하세요.');
            }
        };

        return (
            <form onSubmit={handleSubmit}>
                <h2>새 게시글 작성</h2>
                <div>
                    <label>제목:</label>
                    <input type="text" name="title" value={specs.title} onChange={handleChange} />
                    {errors.title && <p style={{ color: 'red' }}>{errors.title[0]}</p>}
                </div>
                <div>
                    <label>내용:</label>
                    <textarea name="content" value={specs.content} onChange={handleChange} />
                    {errors.content && <p style={{ color: 'red' }}>{errors.content[0]}</p>}
                </div>
                <div>
                    <label>카테고리:</label>
                    <select name="category" value={specs.category} onChange={handleChange}>
                        <option value="기술">기술</option>
                        <option value="일상">일상</option>
                        <option value="리뷰">리뷰</option>
                    </select>
                    {errors.category && <p style={{ color: 'red' }}>{errors.category[0]}</p>}
                </div>
                <button type="submit" disabled={!isValid}>게시글 등록</button>
                <button type="button" onClick={resetSpecs}>초기화</button>
                <pre>{JSON.stringify(specs, null, 2)}</pre>
            </form>
        );
    }

    export default PostForm;
    ```

### 문제 해결 가이드

1.  **명세 객체가 예상대로 업데이트되지 않음:**
    *   **문제**: `updateSpec` 함수를 호출했지만, 컴포넌트가 다시 렌더링되지 않거나 `specs` 객체의 값이 변경되지 않는 것처럼 보입니다.
    *   **원인**: `updateSpec`에 전달하는 객체가 불변성을 유지하지 않거나, React의 재조정(reconciliation) 과정에서 변경을 감지하지 못하는 경우가 있을 수 있습니다. 특히 깊은 중첩 객체를 직접 수정하는 대신, 항상 새로운 객체를 생성하여 `updateSpec`에 전달해야 합니다.
    *   **해결책**: `updateSpec`에 전달하는 인자가 항상 새로운 객체인지 확인하세요. 예를 들어, `updateSpec({ ...specs, nested: { ...specs.nested, value: newValue } })`와 같이 스프레드 연산자를 사용하여 불변성을 유지해야 합니다. `useSpecs` 훅의 내부 구현이 `setSpecs`를 호출할 때 `Object.is` 비교를 통해 변경을 감지하므로, 참조가 변경되어야 합니다.

2.  **유효성 검사 오류가 실시간으로 반영되지 않음:**
    *   **문제**: 사용자 입력에 따라 `specs`는 업데이트되지만, `isValid` 또는 `errors` 객체가 즉시 변경되지 않습니다.
    *   **원인**: `useSpecs` 훅의 `validator` 옵션이 올바르게 구현되지 않았거나, 유효성 검사 로직이 비동기적으로 작동하는데 훅이 이를 처리하도록 설계되지 않았을 수 있습니다. 또한, `validator` 함수 내에서 예외가 발생하여 `isValid` 및 `errors`가 업데이트되지 않을 수도 있습니다.
    *   **해결책**:
        *   `validator` 함수가 동기적으로 `isValid`와 `errors`를 반환하는지 확인하세요. 비동기 유효성 검사가 필요한 경우, `useSpecs` 훅이 비동기 유효성 검사 상태를 관리할 수 있도록 내부 로직을 확장하거나, 외부에서 비동기 유효성 검사를 별도로 처리해야 합니다.
        *   `validator` 내부에서 발생하는 모든 예외를 `try...catch` 블록으로 적절히 처리하고, 유효성 검사 실패 시 `isValid: false`와 함께 `errors` 객체를 반환하도록 하세요.
        *   `onValidate` 콜백을 사용하여 유효성 검사 결과를 디버깅하고, 콜백이 예상대로 호출되는지 확인하세요.

3.  **컴포넌트가 불필요하게 많이 렌더링됨:**
    *   **문제**: `useSpecs`를 사용하는 컴포넌트가 `specs` 객체의 작은 변경에도 불구하고 너무 자주 렌더링되는 것 같습니다.
    *   **원인**: `useSpecs` 훅의 반환 값(`specs`, `isValid`, `errors`, `updateSpec`, `resetSpecs`) 중 하나라도 매 렌더링마다 새로운 참조를 생성하면, React는 컴포넌트가 변경되었다고 판단하여 불필요한 재렌더링을 유발할 수 있습니다. 특히 `updateSpec`이나 `resetSpecs` 같은 함수가 `useCallback`으로 메모이제이션되지 않았다면 문제가 될 수 있습니다.
    *   **해결책**: `useSpecs` 훅의 내부 구현이 `specs` 객체와 `errors` 객체를 `useMemo`로, 함수(`updateSpec`, `resetSpecs`)를 `useCallback`으로 적절히 메모이제이션하고 있는지 확인해야 합니다. 만약 직접 구현하는 경우, 이러한 React Hooks를 사용하여 반환되는 값들의 참조 안정성을 보장해야 합니다. 외부에서 `useSpecs`를 사용할 때는 반환된 `specs` 객체를 하위 컴포넌트에 전달할 때 `React.memo`를 사용하여 하위 컴포넌트의 불필요한 렌더링을 방지할 수 있습니다.