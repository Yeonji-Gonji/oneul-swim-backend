import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// ESLint 설정. `pnpm lint`(= eslint .)와 CI(ci.yml 의 verify 잡)가 쓴다. 포맷은 Prettier 가 맡고 여기서는 보지 않는다.
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'docs/**',
      'data/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // 데코레이터 메타데이터를 켠 빌드(tsconfig.json)라는 사실을 파서에 알린다.
    // 이 옵션이 없으면 consistent-type-imports 가 생성자 주입용 클래스 import 를 `import type` 으로
    // 바꾸라고 하고, 그대로 바꾸면 메타데이터가 사라져 Nest 의존성 주입이 런타임에 실패한다.
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
