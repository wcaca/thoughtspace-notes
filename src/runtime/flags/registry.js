/**
 * [INPUT]: docs/superpowers/specs/*.md 的 flags: frontmatter
 * [OUTPUT]: 静态 registry map: name → { default, status, scope, regression_subset, ... }
 * [POS]: src/runtime/flags/registry.js,被 npm run generate:flag-registry 自动生成
 * [PROTOCOL]: 变更 spec flags 后必须重新生成,然后检查 ../CLAUDE.md
 *
 * ⚠️ AUTO-GENERATED FROM SPEC FRONTMATTER
 * ⚠️ 手动修改会被覆盖;请编辑 spec 后跑: npm run generate:flag-registry
 */

export const FLAG_REGISTRY = Object.freeze({
  'observe-mode-cohort-toggle': Object.freeze({
      "name": "observe-mode-cohort-toggle",
      "type": "boolean",
      "default": true,
      "status": "beta",
      "owner_spec": "kanban-layered-space",
      "since": "2026-07-07",
      "deprecation_window_days": 90,
      "scope": {
          "modules": [
              "src/render",
              "src/core"
          ],
          "files": [
              "src/main.js",
              "src/render/observe-views.js",
              "src/render/canvas-mode.js"
          ]
      },
      "regression_subset": {
          "include": [
              "tests/render/sp1-canvas-modes.test.js",
              "tests/render/observe-views.test.js",
              "tests/integration/sp1-integration.test.js"
          ],
          "exclude": []
      },
      "rollout": 100,
      "kill_switch": "KILL_SP1",
      "depends_on": [],
      "conflicts_with": []
  }),

  'shape-resolver-weights-v2': Object.freeze({
      "name": "shape-resolver-weights-v2",
      "type": "enum",
      "values": [
          "ratio-first",
          "hull-first",
          "dwell-first",
          "balanced"
      ],
      "default": "balanced",
      "status": "experimental",
      "owner_spec": "shape-adaptive-views",
      "since": "2026-07-07",
      "deprecation_window_days": 60,
      "scope": {
          "modules": [
              "src/core"
          ],
          "files": [
              "src/core/shape-resolver.js"
          ]
      },
      "regression_subset": {
          "include": [
              "tests/core/shape-resolver.test.js"
          ],
          "exclude": []
      },
      "rollout": 0,
      "cohort": {
          "type": "hash",
          "weights": [
              {
                  "variant": "balanced",
                  "weight": 100
              }
          ]
      },
      "kill_switch": null,
      "depends_on": [],
      "conflicts_with": []
  }),

  'yjs-persistence-batch-write': Object.freeze({
      "name": "yjs-persistence-batch-write",
      "type": "number",
      "default": 50,
      "status": "experimental",
      "owner_spec": "persistence-yjs-bridge",
      "since": "2026-07-07",
      "deprecation_window_days": 60,
      "scope": {
          "modules": [
              "src/persistence"
          ],
          "files": [
              "src/persistence/yjs-store.js"
          ]
      },
      "regression_subset": {
          "include": [
              "tests/persistence/persistence-roundtrip.test.js",
              "tests/persistence/undo-manager.test.js"
          ],
          "exclude": []
      },
      "rollout": 0,
      "kill_switch": null,
      "depends_on": [],
      "conflicts_with": []
  }),

});

export function getFlagDef(name) {
  return FLAG_REGISTRY[name];
}

export function listFlags() {
  return Object.keys(FLAG_REGISTRY);
}
