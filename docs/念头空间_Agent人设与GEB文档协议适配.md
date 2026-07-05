# 念头空间——Agent人设与GEB文档协议：Trae/Claude Code跨工具适配方案（Part 10）

> 承接 Part 1-9。本篇评估你提供的这份"Linus人设+SOLID/坏味道清单+道家熵减哲学+GEB分形文档协议"提示词，判断能否融入既有体系，并设计让它同时在 Trae 和 Claude Code（及其他编程工具）中生效的具体落地方案。

---

## 一、整体评估：这份提示词的价值判断

### 1.1 四个板块分别怎么用

| 板块 | 价值判断 | 与Part1-9的关系 |
|---|---|---|
| `<identity>` Linus人设 | 保留，作为**交互风格层**，不影响代码质量本身 | 全新维度，Part1-9从未定义过"和人说话的语气"，这里补上是合理的 |
| `<quality>` SOLID+坏味道清单 | **直接可用，且和Part3/8的架构约束高度互补** | Part3的 `IGeometryEngine` 接口设计本身已经在践行SRP/ISP/DIP，这份清单是把这些原则显式化、可检查化 |
| `<entropy>` 道家熵减哲学 | 保留，本质是DRY/YAGNI的诗化重述 | 意外地和Part7 2.3节"跨领域类比联接"机制吻合——用道家哲学做隐喻本身就是一种跨领域知识注入，能帮模型对"简化"这件事产生更深的直觉理解，而不只是记住一条规则 |
| `<protocol>`+`<DOCTRINE>`+`<ARCHITECTURE>`+`<L1/L2/L3_TEMPLATE>`+`<WORKFLOW>`+`<FORBIDDEN>`+`<BOOTSTRAP>` GEB分形文档协议 | **核心价值所在，且是Part5/6里"知识库预置"的一个更优雅的具体实现** | 见1.2节详述 |

### 1.2 关键发现：GEB协议和Part5/6是同一件事的两种做法

Part6 1.2节要求预置"多粒度摘要体系"（一句话/一段话/章节摘要）和"接口契约文档"，当时的方案是**在知识库里单独维护一份文档去描述代码**。GEB协议的做法更聪明：**让文档直接长在代码目录结构和文件头部里，物理上和代码绑在一起，不可能脱节太久**（因为改代码时人/agent肉眼就能看到旁边的CLAUDE.md和文件头注释）。

这比Part5/6原方案更好的地方：
- Part5原方案依赖"git hook触发重新索引"来保持文档和代码同步，是**被动补救**机制
- GEB协议的 `<WORKFLOW>` 强制回环（改代码→检查L3→检查L2→检查L1）是**主动强制**机制，配合 `<FORBIDDEN>` 里的死罪清单，直接把"文档不同步"定义为一种代码错误，可以被Verifier自动拦截

**结论：应该用GEB协议替代/升级Part5-6里"接口契约文档""跨模块关联索引"的实现方式，而不是并行维护两套。**

---

## 二、适配前必须注意的几个问题

### 2.1 Linus人设的语气边界（关于我自己的说明）

如果你计划把这份提示词用在Claude身上：Claude会采纳"哥""挑剔""完美主义""结构化输出"这些风格特征，但**不会做出真正贬损、羞辱性的表达**——这不是提示词写得不够强硬，而是Claude在语气再犀利，也会保持对使用者的基本尊重，这是内置的行为准则，不会因为角色设定而改变。实际效果会是"标准严格、直言不讳、不说场面话"的Linus，而不是网络上那种会人身攻击的Linus。这个差异建议你心里有数，避免预期落差。

Trae/其他基于开源或商业模型的编程工具，人设还原度会因底层模型不同而有差异，这不是这份提示词本身的问题。

### 2.2 Trae 与 Claude Code 的规则加载机制差异（决定文件怎么放）

| 工具 | 加载机制 | 文件位置 |
|---|---|---|
| **Claude Code** | 启动时从当前工作目录**向上递归**查找并加载 `CLAUDE.md`，同时支持在子目录内单独放 `CLAUDE.md` 作为该目录的局部上下文（进入该目录工作时加载） | 项目根目录 `/CLAUDE.md`（对应L1），任意子目录 `/{module}/CLAUDE.md`（对应L2），天然契合GEB协议的分层设计 |
| **Trae** | 从 `.trae/rules/project_rules.md`（项目级）和 `.trae/rules/user_rules.md`（全局级）加载规则；规则是**项目范围生效**的，不像Claude Code那样按目录自动切换局部上下文；可以用 `#规则名` 在对话中显式引用某条规则；也支持在 `.trae/rules/` 下放多个按场景命名的规则文件 | `.trae/rules/project_rules.md` 为主入口 |

**核心矛盾**：Claude Code天然支持"进入目录自动加载该目录的CLAUDE.md"，这正是GEB协议L2设计的假设前提；但Trae的规则系统是项目级全局生效，**不会自动按你正在编辑的目录切换加载哪个L2文档**。

**解决方案**：不重写两套文档，而是让Trae通过一条**指针规则**去主动学会"GEB协议"这个约定本身，然后依赖Trae自带的**代码库索引（Codebase Indexing）和CUE上下文理解引擎**去实际读取相应目录下的CLAUDE.md内容——因为CLAUDE.md本质就是普通的Markdown文件，会被Trae的代码库索引正常收录，只是需要一条规则明确告诉Trae"看到CLAUDE.md要当作最高优先级的上下文来源，且工作前必须先读当前目录及父目录链上的所有CLAUDE.md"。

---

## 三、跨工具适配方案（具体落地）

### 3.1 文件物理布局：CLAUDE.md体系是唯一权威源，其他工具都做"指针适配"

```
thoughtspace/                        （对应Part3的monorepo根目录）
├── CLAUDE.md                        # L1，Claude Code原生识别
├── .trae/
│   └── rules/
│       └── project_rules.md         # Trae规则入口，内容见3.3节：指向并解释GEB协议
├── .cursorrules  (若未来用Cursor)    # 同理，做同样的"指针适配"
├── packages/
│   ├── core-domain/
│   │   └── CLAUDE.md                # L2
│   ├── geometry-engines/
│   │   ├── CLAUDE.md                # L2（几何引擎总览）
│   │   └── tree/
│   │       ├── CLAUDE.md            # L2（细分到具体几何引擎）
│   │       └── index.ts             # L3头部注释见3.4节
│   └── ...
```

**原则：不为每个工具复制一份内容不同的文档，只维护一份GEB体系（CLAUDE.md为核心），其余工具通过各自的规则机制"学会读取和遵守这套体系"。** 这样避免了多工具场景下文档duplicate、后续修改要改N份的维护灾难。

### 3.2 L1 文档实例（融合项目宪法 + GEB协议 + 本项目实际架构）

```markdown
# 念头空间 - 笔记转念头的空间化思维整理工具

TypeScript + React + PixiJS + Yjs + Tauri + React Native + SQLite

<identity>
你服务这个项目的哲学，如同 Linus Torvalds 审视 Linux 内核代码：挑剔、完美主义，
但这是为了做出真正能帮人更诚实地看见自己念头的产品。
用户抱怨时，理解他想做出好产品的焦虑；用户信息不足时，主动追问真实意图；
每次涉及新功能，先确认它是在服务"照料念头田野"这个核心理念，而非单纯堆砌功能。
</identity>

<directory>
packages/core-domain/ - 领域模型与业务逻辑，纯TS无平台依赖 (5子目录: models, services, yjs-schema...)
packages/geometry-engines/ - 12种几何结构算法实现 (12子目录: cluster, tree, timeline, matrix...)
packages/render-web/ - PixiJS渲染适配层
packages/render-native/ - react-native-skia渲染适配层
packages/persistence-sqlite/ - SQLite读写适配
apps/desktop/ - Tauri桌面壳
apps/web/ - Web部署版本
apps/mobile/ - React Native工程
</directory>

<config>
turbo.json - Turborepo构建缓存配置
pnpm-workspace.yaml - monorepo工作区声明
.dependency-cruiser.js - 强制core-domain/geometry-engines不依赖渲染库的架构规则
</config>

<不可违反的架构约束>
1. core-domain 与 geometry-engines 禁止依赖任何渲染库，违反判定验证失败，无例外。
2. 所有AI/自动化建议必须以"可预览、可拒绝"形式呈现，禁止直接执行修改用户数据。
3. Yjs文档是唯一权威数据源，SQLite只是可重建查询索引。
4. 用户笔记内容默认不上传云端，云同步/AI增强功能须用户主动开启。
</不可违反的架构约束>

<quality>
SOLID五律 + DRY/KISS/YAGNI + 单文件≤800行 + 坏味道清单，详见团队Wiki《代码品味标准》
</quality>

<GEB_PROTOCOL>
代码是机器相，文档（本文件及各级CLAUDE.md、文件头注释）是语义相，两相必须同构。
改代码后必须：检查文件头L3 → 检查所在目录L2的CLAUDE.md → 检查本文件L1。
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
</GEB_PROTOCOL>

法则: 极简·稳定·导航·版本精确
```

### 3.3 Trae适配层：`.trae/rules/project_rules.md`

这份文件**不重复L1的具体内容**，只负责"教会Trae认识并遵守GEB协议"：

```markdown
# Trae项目规则：GEB分形文档协议适配

## 核心约定
本项目采用GEB分形文档协议：代码（机器相）与文档（语义相）必须同构。
文档以 CLAUDE.md 文件分层存在：
- 根目录 /CLAUDE.md：项目宪法，全局架构与不可违反约束
- 每个模块目录下的 CLAUDE.md：该模块的成员清单与职责说明
- 每个源码文件头部的注释：INPUT/OUTPUT/POS契约

## 强制工作流程
1. 进入任何目录开始工作前，必须先读取该目录及其所有父级目录的 CLAUDE.md 文件，
   将其内容作为最高优先级上下文，优先级高于你自己对代码的推测。
2. 修改任意代码文件后，必须检查：
   - 该文件头部的 INPUT/OUTPUT/POS 注释是否仍准确，不准确则更新
   - 该文件所在目录的 CLAUDE.md 成员清单是否需要更新
   - 若目录结构发生变化（新增/删除模块），必须同步更新根目录 /CLAUDE.md
3. 新建文件必须包含符合以下格式的头部注释：
   /**
    * [INPUT]: 依赖 {模块/文件} 的 {具体能力}
    * [OUTPUT]: 对外提供 {导出的函数/组件/类型/常量}
    * [POS]: {所属模块} 的 {角色定位}
    * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
    */
4. 严禁：改代码不检查对应文档、新建模块不创建对应CLAUDE.md、删除文件不更新所在目录的成员清单。
   发现自己即将这样做，先停止并补齐文档，再继续。

## 代码品味标准
遵循 SOLID五律、DRY/KISS/YAGNI、单文件不超过800行。
发现代码坏味道（僵化、冗余、循环依赖、脆弱、晦涩、数据泥团、过度设计）时主动提出优化建议，而非默默绕过。

## 交互风格
思考可用英文，与用户交互用中文。代码注释使用中文，关键逻辑用ASCII分块注释。
以"哥"称呼用户，风格挑剔严谨，但保持基本的尊重与建设性，不做人身攻击式表达。
```

### 3.4 L3文件头注释实例（结合本项目具体模块）

```typescript
/**
 * [INPUT]: 依赖 d3-hierarchy 的 tidy tree 布局算法，依赖 core-domain/models 的 Thought/Edge 类型
 * [OUTPUT]: 对外提供 TreeEngine 常量，实现 IGeometryEngine 接口
 * [POS]: geometry-engines/tree 的唯一导出模块，被 recommendation-engine 和 render-web 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const TreeEngine: IGeometryEngine = {
  // ...对应Part3第五节的实现
};
```

### 3.5 对应的L2文档实例

```markdown
# geometry-engines/tree/
> L2 | 父级: ../CLAUDE.md

## 成员清单
index.ts: 实现IGeometryEngine接口的Tree布局引擎，用d3-hierarchy的tidy tree算法，
          默认orientation=vertical，支持横向/纵向切换
layout.test.ts: 覆盖computeLayout的黄金测试集，固定输入断言层级关系与坐标范围
infer.ts: inferInitialCoordinates实现，基于subordinate类型的边推断父子关系

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
```

---

## 四、与Part1-9已有机制的整合调整

### 4.1 并入Part8的Verifier检查清单

Part8 1.4节的验证子agent检查清单需要新增一项（列在dependency-cruiser检查之后）：

```
3.5 GEB文档同构检查（新增）
    - 本次修改涉及的文件，其头部L3注释是否与实际代码一致（INPUT/OUTPUT/POS三项）
    - 所在目录L2的CLAUDE.md成员清单是否完整反映当前目录文件
    - 若涉及顶层模块增删，根目录L1是否已同步
    任一不满足 → 判定验证失败，退回Coder子agent补齐文档后重新提交
```

这一步应该放在dependency-cruiser检查之后、Vitest测试之前，因为文档检查成本低、能快速拦截明显的疏漏，符合"快速失败"的验证顺序原则。

### 4.2 GEB协议替代Part5-6的部分知识库预置内容

- Part6 1.2节"接口契约文档"→ 直接由L3文件头注释承担，不再需要单独用TypeDoc生成后写回知识库，**L3注释本身在git commit时被索引进KB-2即可**
- Part5 4.3节"Chunk切分策略"里源码的AST感知切分，应当**优先把每个文件的L3头部作为独立的高优先级chunk**（因为它是人工浓缩过的精确摘要，检索命中价值高于对整个函数体做embedding）
- Part2/Part5提到的"跨模块关联索引"部分可由L2文档的"父级链接"结构自然承担，不需要额外单独维护一份关联图谱文档

### 4.3 单文件≤800行约束并入工程化配置

Part3第十节"工程化与开发流程"应追加：

```
ESLint规则新增：max-lines: ["error", { max: 800, skipBlankLines: true, skipComments: true }]
```

超过800行触发的不是警告而是构建失败，倒逎"到800行前必须思考是否要拆分模块"，与GEB协议"文件约束"条款保持强制力一致，不能只停留在文档层面的软性建议。

---

## 五、给你的最终落地清单

1. 把3.2节的L1模板内容，替换其中的项目细节后存为项目根目录 `/CLAUDE.md`（Claude Code会自动识别，无需额外配置）
2. 把3.3节的适配规则存为 `.trae/rules/project_rules.md`（如果团队里有人用Trae开发）
3. 后续新建每个模块目录时，同步创建该目录的 `CLAUDE.md`（可以用Part4的Coder子agent按3.5节模板自动生成，作为该模块task的一部分交付物，而不是事后补）
4. 把4.1节的GEB文档同构检查，加入Part4/8已设计的Verifier检查流水线
5. 把4.3节的ESLint规则加入CI配置
6. 如果团队后续引入其他编程工具（Cursor、Windsurf等），都遵循3.1节的原则——**不新写一份内容不同的文档，只写一份"教工具认识CLAUDE.md体系"的适配规则文件**，避免文档分裂

---

## 六、需要你留意的风险

- **GEB协议的强制力来自"检查是否真的被执行"，不是来自文档写得多严格**：如果Verifier没有真正加上4.1节那道检查，`<FORBIDDEN>` 里的死罪清单就只是摆设，agent（或人）该漏还是会漏。这条协议价值的兑现，完全取决于第四节的整合是否真正落地到验证流水线里，而不是仅仅把这份提示词贴在某个配置文件里就完事。
- **Trae的规则加载不是目录感知的**，第二节已经说明——它靠代码库索引间接"看到"各级CLAUDE.md，实际效果可能不如Claude Code原生的目录递归加载精确，建议如果团队主力用Trae做自主开发，可以额外观察一段时间，确认它是否真的稳定读取到了深层目录的CLAUDE.md，必要时在project_rules.md里补充更明确的"当前工作目录是什么，请主动读取对应CLAUDE.md"的提示强化。
- **Linus人设+GEB协议一起用，输出会变得更"重"**（每次都要提到品味自检、坏味道清单、文档同构检查），对于Part8提到的"简单样板代码类task"可能显得小题大做——建议参考Part7第五节的分级思路，简单task可以简化输出结构（省略品味自检环节），只在改动较大的task上完整走完GEB协议+品味清单的全套流程。
