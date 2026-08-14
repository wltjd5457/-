# 원장 사수 가디언즈 참가자 가이드

## 목표

GitHub Copilot App으로 리포지토리를 열고, 범위를 제한한 구현 프롬프트를 실행하고, 
에이전트가 만든 diff를 검토한 뒤 Browser Canvas에서 즉시 플레이합니다. 우리의 목표는, '내 게임'을 '완성 데모' 처럼 만드는 거예요~

작업 대상은 `http://127.0.0.1:5173`의 **내 게임**, 참고 대상은 `http://127.0.0.1:5173/?mode=demo`의 **완성 데모**입니다. 내 게임은 미션 없이도 완주할 수 있습니다. 코드 내부에서는 내 게임을 `baseline`, 완성 데모를 `demo`라고 부릅니다. 

## 게임 시나리오

매일 자정, 오류와 장애가 몬스터로 출현합니다. 점검이 끝나고 얼른 퇴근하고 싶은 금융 IT 개발자 **토대리**가 원장 서버의 **차대 정합성**을 지켜야 합니다. 토대리는 목숨이 5개 이고, 몬스터와 직접 충돌하면 피해를 받습니다. 게임은 100초짜리 **야간 배치 사수전**이며, 완성 데모에서는 새벽 점검실과 최고 점수를 갱신하는 무한 기록전이 이어집니다.

일반 몬스터의 75%는 토대리를 쫓고 25%는 원장 서버를 공격하며, 보스는 서버로 향합니다. `WASD`나 방향키로 추적 몬스터를 피하면서 서버로 향하는 위협을 요격해야 합니다.

## 공통 시작점 (이 부분은 손 안 대셔도 됩니다. 그냥 어떤 식으로 구성이 되어있구나 하는 게임 컴포넌트 이해 차원입니다)

다음 규칙은 네 미션을 시작하기 전에 이미 내 게임과 완성 데모에 공통으로 구현되어 있습니다. 미션 프롬프트는 이 값을 다시 만들거나 바꾸지 않고 그대로 보존합니다.

| 영역 | 현재 계약 |
| --- | --- |
| 라운드 | 100초, 88초에 보스 등장 |
| 토대리 | 체력 5, 이동 속도 `235 * 1.1 * 1.05 * 1.2 = 325.71`, 접촉 피해 1, 피격 후 1.4초 무적. 중앙에 가만히 서 있으면 1·2단계를 모두 통과할 수 없음 |
| 차대 정합성 | 100으로 시작하며 일반 처치나 Q로 회복되지 않음 |
| 추적 대상 | 일반 몬스터는 생성 순서 네 마리마다 앞의 세 마리가 토대리, 네 번째가 서버를 추적해 정확히 75:25 유지. 보스는 항상 서버 추적 |
| 적 속도 | 수수료 `68 * 1.15 * 1.3`, 중복 `95 * 1.15 * 1.3`, 역분개 `49 * 1.15 * 1.3`, 보스 `89 * 1.15 * 1.3` |
| 적 체력·생성 | 1단계 체력 `* 1.15`, 생성 간격 `/ 1.15`로 생성량 15% 증가. 적별 `토`·`원` 배지는 표시하지 않음 |
| 기본 공격 | 탐색 반경 320, 피해 5.1, 이동 중 340ms·정지 중 700ms, 투사체 속도 590 |
| 원장 서버 그림 | `USE_LEDGER_SERVER_LOGO = true`일 때 투명 PNG 로고 사용. `false`이거나 이미지가 준비되지 않으면 보존된 `drawOriginalVault` 사용 |
| 삭제된 기능 | 전표 추적기, 멱등성 방화벽, 거래 ID/중복 거래 상태는 없음. 정규 미션에서 다시 추가하지 않음 |
| UI 공통값 | 토대리 체력은 5개 하트로 크게 표시. 미션 패널은 행별로 열고, 사운드 버튼은 보너스 전까지 내 게임에 노출하지 않음 |
| API 플래그 | `/api/game-config`의 `missions`는 시작점에서 내 게임 false, 완성 데모 true. 각 미션을 내 게임에 열 때 core/UI 분기와 해당 baseline 플래그가 함께 열려야 함 |
| 비공개 helper | `startSecondStage`, `startEndlessStage`, `upgradeEndlessEnemies`, `endlessScale`, `rewardDefeat`, `fireAutomaticAttack`는 `game.ts` 내부에서 제자리 수정. 새 export/import 불필요 |

미션 diff에서 위 값이나 `apps/web/src/assets/ledger-server-logo.png`가 바뀌면 범위를 벗어난 것입니다.

## 시작

```bash
npm install
npm run dev
```

Copilot App에서 Browser Canvas 두 개를 엽니다. (하나만 여셔도 되긴 하는데.. 게임 플레이 중이면 왔다갔다가 안되니까요)

- **내 게임 — 작업용:** `http://127.0.0.1:5173`
- **완성 데모 — 비교용:** `http://127.0.0.1:5173/?mode=demo`

항상 내 게임에서 플레이하고, 완성 데모는 결과 비교에만 사용합니다. Vite HMR이 두 화면에 같은 코드 변경을 반영하므로 프롬프트마다 `baseline`만 확장하고 기존 `demo` 동작을 보존해야 합니다.

진행 순서는 항상 같습니다.

1. 관련 파일을 열어 프로젝트 문맥을 확인합니다.
2. 아래 프롬프트를 Interactive 또는 Autopilot mode로 실행합니다.
3. 에이전트가 짧게 범위를 밝힌 뒤 멈추지 않고 구현과 검사까지 완료하게 둡니다.
4. diff에서 **내 게임만 변경 / 완성 데모 보존**이 지켜졌는지 직접 검토합니다.
5. 해당 미션 검사와 `npm run test:missions` 결과를 확인합니다.
6. 내 게임에서 새 기능을 플레이하고 완성 데모가 그대로인지 비교합니다.


미션은 1번부터 순서대로 진행합니다. 각 프롬프트에는 작업 대상, 정확한 수치, 공통 계약과 회귀 조건이 모두 들어 있으므로 인용 블록 전체를 그대로 복사하세요.

## 미션 1 — 정합성 핫픽스 스킬 (약 7분)

관련 파일: `packages/game-core/src/game.ts`, `packages/game-core/src/extensions.ts`, `apps/web/src/GameCanvas.tsx`, `apps/api/src/index.ts`

구현 프롬프트:

> **보호 범위:** 완성 데모 구현은 `packages/game-core/src/demoMissions.ts`, demo 연결은 `packages/game-core/src/game.ts`의 `WORKSHOP_EXTENSIONS.demo`, demo API 설정은 `apps/api/src/index.ts`의 `DEMO_MISSIONS`에 있다. 이 범위는 열람·검색·import·수정하지 말고 demo 조건 삭제나 baseline 연결에도 사용하지 마. **작업 범위:** `packages/game-core/src/baselineMissions.ts`, `packages/game-core/src/extensions.ts`, `apps/web/src/GameCanvas.tsx`, `apps/api/src/index.ts`, `packages/game-core/workshop/missions.challenge.ts`만 읽고 `/`의 내 게임에 정합성 핫픽스를 직접 구현해. 워크숍 상태 경로는 반드시 `state.workshop.ultimateCharge`와 `state.workshop.ultimatePulseMs`를 사용하고 `GameState` 직속 필드를 만들지 마. 적 처치마다 `state.workshop.ultimateCharge`를 11 올려 최대 100으로 제한하고, `state.phase === "playing"`이며 충전 100일 때만 Q가 발동해야 한다. 토대리 중심 반경 340 안의 일반 적은 즉시 제거하고 보스는 피해 30, 범위 밖 적은 유지한다. 사용 후 `state.workshop.ultimateCharge=0`, `state.workshop.ultimatePulseMs=900`, `state.announcement`와 `state.announcementUntilMs`를 갱신하며 `state.vault.health`와 `state.player.health`는 회복하지 않는다. `BASELINE_MISSIONS`는 `consistencyHotfix:true`, 나머지 네 플래그는 false여야 한다. `/api/game-config?mode=baseline` 응답을 확인하고 내 게임 미션 패널에 **01 정합성 핫픽스 행만** 나타나게 해. 이 행에는 `Q` 키와 `Math.round(view.workshop.ultimateCharge)` 기준 0~100% 충전 수치를 항상 표시하고, 100%이면 색상뿐 아니라 `사용 가능` 텍스트도 보여 언제 Q를 누를지 알 수 있어야 한다. 플래그가 true인데 행이나 충전 UI가 안 보이면 `GameCanvas.tsx`에서 `config.missions.consistencyHotfix`와 `view.workshop.ultimateCharge`에 연결해. **보존/검증:** demo 파일, registry, challenge, 공통 전투 수치와 삭제된 기능은 건드리지 말고 새 의존성 없이 `npm run test:mission:1`, `npm run test:missions`, `npm test`, `npm run typecheck`를 통과시켜.

확인:

```bash
npm run test:mission:1   # 시작점에서는 의도적으로 빨간색
npm run test:missions    # 완성 데모 challenge는 계속 초록색
npm test
npm run typecheck
```

완료 후 내 게임에서 Q가 동작하고, 완성 데모에서도 같은 스킬이 이전처럼 동작하는지 확인합니다.

## 미션 2 — 눈물젖은 전표 날리기 (약 6분)

관련 파일: `packages/game-core/src/game.ts`, `packages/game-core/src/types.ts`, `apps/web/src/GameCanvas.tsx`, `apps/api/src/index.ts`

구현 프롬프트:

> **보호 범위:** `packages/game-core/src/demoMissions.ts`, `packages/game-core/src/game.ts`의 `WORKSHOP_EXTENSIONS.demo`, `apps/api/src/index.ts`의 `DEMO_MISSIONS`는 완성 데모 전용이다. 열람·검색·import·수정하거나 demo gate를 제거하지 마. **작업 범위:** 미션 1 구현과 01행 Q 충전 UI를 보존하고 `packages/game-core/src/baselineMissions.ts`, `packages/game-core/src/config.ts`, `packages/game-core/src/types.ts`, `apps/web/src/GameCanvas.tsx`, `apps/api/src/index.ts`만 사용해 눈물젖은 전표 날리기를 baseline에 직접 구현해. 조건과 상태 경로는 `state.phase==="playing"`, `state.score>=TEARFUL_RECEIPT_SCORE`, `state.player.weaponLevel===1`이며 성공 시 `state.player.weaponLevel=2`, `state.announcement`, `state.announcementUntilMs`를 갱신한다. R 키나 화면 버튼으로만 한 번 활성화되고 자동 진화하지 않는다. 발사 각도는 `[-0.18,0,0.18]`, 중앙 노란 전표 1장과 양옆 하늘색 눈물방울 2개, 각 투사체 속도 590·반경 7·수명 1,000ms·피해 5.1, 이동/정지 연사 340/700ms다. `BASELINE_MISSIONS`는 01/02만 true, 03/04/soundRoom은 false여야 한다. baseline API 응답을 확인하고 내 게임에 01행 충전율과 **02 눈물젖은 전표 날리기 행**이 함께 보여야 하며, 02행에는 `Math.min(view.score, 2_000)/2,000` 진행도와 활성화 가능 R 버튼, 활성화 후 완료 텍스트를 표시해. **보존/검증:** demo 파일, registry, challenge와 미션 1을 수정하지 말고 새 의존성 없이 미션 1/2 검사, `npm run test:missions`, `npm test`, `npm run typecheck`를 통과시켜.

확인:

```bash
npm run test:mission:2
npm run test:missions
npm test
npm run typecheck
```

구현 후 내 게임과 완성 데모 양쪽에서 2,000점 달성 후 버튼이나 R 키로만 활성화되고, 기존 전표 한 장과 하늘색 눈물방울 두 개가 발사되는지 비교합니다.

## 미션 3 — 새벽 점검실 스테이지 (약 7분)

관련 파일: `packages/game-core/src/game.ts`, `packages/game-core/src/types.ts`, `apps/web/src/GameCanvas.tsx`, `apps/api/src/index.ts`

구현 프롬프트:

> **보호 범위:** `packages/game-core/src/demoMissions.ts`, `packages/game-core/src/game.ts`의 `WORKSHOP_EXTENSIONS.demo`, `apps/api/src/index.ts`의 `DEMO_MISSIONS`는 완성 데모 전용이다. 열람·검색·import·수정하거나 baseline에 연결하지 마. **작업 범위:** 미션 1·2와 01/02행 UI를 보존하고 `packages/game-core/src/baselineMissions.ts`, `packages/game-core/src/extensions.ts`, `packages/game-core/src/game.ts`, `packages/game-core/src/types.ts`, `apps/web/src/GameCanvas.tsx`, `apps/api/src/index.ts`에서 baseline 새벽 점검실을 구현해. 1단계 보스 처치 시 승리 대신 `state.stage=2`, `state.elapsedMs=0`, `state.bossSpawned=false`, `state.bossDefeated=false`, `state.spawnCooldownMs=1_200`, `state.enemies=[]`, `state.projectiles=[]`로 전환해. `state.score`, `state.vault.health`, `state.player.health`, `state.workshop.ultimateCharge`, `state.player.weaponLevel`은 보존한다. 2단계 적 체력은 원본에 `1.3*1.15`, 현재 속도에 `1.2*1.1`, 피해·점수는 `*1.2`, 생성 간격은 `*0.7`, 보스 최대 체력은 126이다. 청록 바닥과 `새벽 재점검 // 갑자기 튀어나온 더 큰 숫자` HUD를 표시하고 이번 미션까지는 2단계 보스 처치 후 승리하게 해. `BASELINE_MISSIONS`는 01/02/03 true, 04/soundRoom false여야 한다. baseline API 응답과 내 게임 미션 패널의 **01·02·03행 동시 노출**을 확인하고 03행에 `1단계 보스 대기/진행 중/완료` 상태를 표시해. **보존/검증:** demo 파일·registry·challenge, 75:25 추적과 기존 미션을 수정하지 말고 미션 1~3 검사, `npm run test:missions`, `npm test`, `npm run typecheck`를 통과시켜.

확인:

```bash
npm run test:mission:3
npm run test:missions
npm test
npm run typecheck
```

구현 후 내 게임과 완성 데모에서 1단계 보스 처치 직후 새 타이머와 바닥 팔레트가 시작되고, 2단계 보스 체력이 126인지 확인합니다.

## 미션 4 — 히든 무한 기록전 (약 5분)

관련 파일: `packages/game-core/src/game.ts`, `packages/game-core/src/types.ts`, `apps/web/src/GameCanvas.tsx`, `apps/api/src/index.ts`

구현 프롬프트:

> **보호 범위:** `packages/game-core/src/demoMissions.ts`, `packages/game-core/src/game.ts`의 `WORKSHOP_EXTENSIONS.demo`, `apps/api/src/index.ts`의 `DEMO_MISSIONS`와 `apps/web/src/arcadeAudio.ts`는 완성 데모 전용이다. 열람·검색·import·수정하거나 demo gate·registry를 바꾸지 마. **작업 범위:** 이전 미션과 01~03행 UI를 보존하고 `packages/game-core/src/baselineMissions.ts`, `packages/game-core/src/extensions.ts`, `packages/game-core/src/game.ts`, `packages/game-core/src/types.ts`, `apps/web/src/GameCanvas.tsx`, `apps/api/src/index.ts`에서 baseline 무한 기록전을 구현해. 2단계 보스 처치 시 `state.stage=3`, `state.elapsedMs=0`, `state.bossSpawned=false`, `state.bossDefeated=false`, `state.spawnCooldownMs=800`, `state.enemies=[]`, `state.projectiles=[]`로 전환해. 3단계에는 시간 제한과 보스가 없고 `state.player.health` 또는 `state.vault.health`가 0일 때만 종료한다. WAVE는 `floor(state.elapsedMs/20_000)+1`, WAVE마다 기존·신규 적 체력/속도/피해/점수 `+10/+4/+8/+10%`, 투사체 피해 +5%, 연사 +3%다. 생성 배율은 0.65에서 WAVE당 0.04 감소하고 최저 0.25다. baseline 기록 키 `ledger-guardians-my-game-endless-record`를 demo 기록과 분리해. `BASELINE_MISSIONS`는 01~04 true, soundRoom false여야 한다. baseline API 응답과 내 게임 미션 패널의 **01~04행 동시 노출**을 확인하고 04행에 `무한 점검 WAVE n · 최고 n점`, HUD에 WAVE·생존 시간·강화 단계·현재/최고 점수를 표시해. **보존/검증:** demo 파일·registry·challenge와 이전 미션을 수정하지 말고 미션 1~4, `npm run test:missions`, `npm test`, `npm run typecheck`, `npm run build`, `git diff --check`를 통과시켜.

확인:

```bash
npm run test:mission:4
npm run test:missions
npm test
npm run typecheck
npm run build
git diff --check
```

내 게임과 완성 데모에서 2단계 보스 처치 직후 보라색 무한 점검실로 진입하고, 20초마다 WAVE와 강화 단계가 함께 오르며 패배 시 최고 점수가 갱신되는지 비교합니다.

## 히든 미션 — 오락실 사운드를 더해 보세요 (선택, 약 5분)

<details>
<summary>완성 데모 오른쪽 위에서 ♫ 소리 버튼을 발견했다면 열기</summary>

관련 파일: `apps/web/src/arcadeAudio.ts`, `apps/web/src/GameCanvas.tsx`, `apps/web/src/styles.css`

완성 데모에는 외부 음원 파일 없이 Web Audio API로 직접 합성한 오리지널 칩튠 BGM과 효과음이 숨어 있습니다. 정규 미션을 일찍 끝낸 참가자는 다음 프롬프트로 같은 사운드룸을 내 게임에 해금합니다.

구현 프롬프트:

> **보호 범위:** demo 사운드 구현 전체는 `apps/web/src/arcadeAudio.ts`, demo 미션은 `packages/game-core/src/demoMissions.ts`, demo API 설정은 `apps/api/src/index.ts`의 `DEMO_MISSIONS`에 있다. 이 범위는 열람·검색·import·수정하지 말고 baseline이 demo 오디오 factory를 호출하게 만들지 마. **작업 범위:** 미션 1~4와 01~04행 UI를 보존하고 `apps/web/src/GameCanvas.tsx`, `apps/web/src/api.ts`, `apps/web/src/styles.css`, `apps/api/src/index.ts`만 읽어 baseline 전용 오디오 구현 파일을 새로 만들어 연결해. 외부 음원·패키지 없이 Web Audio API로 130 BPM, C장조 주선율·낮은 대선율·bass, lead/counter stereo panner, music gain 0.42, master 0.55, effects 0.45를 구현해. 사용자 입력 뒤에만 AudioContext를 만들고 진행 중에만 BGM을 재생하며 일시정지·승패·재시작 때 멈춘다. 발사, 일반/보스 처치, 토대리 피격, 차대 정합성 피해 효과음을 연결하고 같은 프레임 다중 처치는 한 번만 재생해. `BASELINE_MISSIONS`의 01~04는 true를 유지하고 `soundRoom`만 추가로 true로 바꿔. baseline API 응답을 확인하고 내 게임 오른쪽 위에 `♫ 소리 켬/♪ 소리 끔` 버튼과 M 단축키가 나타나며 `aria-pressed`·접근성 이름·unmount 정리가 동작하는지 검증해. **보존/검증:** demo 파일·게임 코어·challenge를 수정하지 말고 `npm test`, `npm run test:missions`, `npm run typecheck`, `npm run build`, `git diff --check`를 통과시켜.

확인:

```bash
npm test
npm run test:missions
npm run typecheck
npm run build
git diff --check
```

내 게임에서 근무 시작 전에는 소리가 나지 않고, 시작 후 BGM과 네 종류의 전투 효과음이 들리는지 확인합니다. P로 멈추면 BGM도 멈추고, M과 화면 버튼이 함께 음소거 상태를 바꾸며, 완성 데모의 사운드는 이전처럼 유지되어야 합니다.

</details>

## 최종 확인

```bash
npm run test:mission:1
npm run test:mission:2
npm run test:mission:3
npm run test:mission:4
npm run test:missions
npm test
npm run typecheck
npm run build
git diff --check
```

내 게임과 완성 데모를 나란히 열어 Q 공격 스킬, R 무기 활성화, 2단계 전환, 무한 기록전의 핵심 동작이 같은지 확인합니다. 보너스 히든 미션까지 진행했다면 BGM, 효과음, M 음소거도 비교합니다. 내 게임 변경이 `baseline`에 추가됐고 기존 `demo` 분기가 삭제되거나 뒤집히지 않았는지 diff에서 확인합니다. 공통 시작점의 75:25 추적, 속도, 생성량, 배지 미표시, 원장 로고 플래그가 그대로인지도 확인합니다.