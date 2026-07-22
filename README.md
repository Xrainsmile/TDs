# TDs — 塔防游戏

基于 **Cocos Creator 3.8.8** 开发的微信小游戏塔防项目。

## 开发环境

| 工具 | 版本 | 用途 |
|---|---|---|
| Cocos Creator | 3.8.8 | 场景编辑、游戏逻辑、构建微信小游戏 |
| 微信开发者工具 | 最新版 | 预览、真机调试、上传发版 |

## 快速开始

### 1. 用 Cocos Creator 打开项目

```bash
open /Applications/Cocos/Creator/3.8.8/CocosCreator.app --args --project /Users/rick/TD
```

首次打开时 Cocos Creator 会自动生成 `library/`、`temp/`、`local/` 等目录（已在 `.gitignore` 中忽略）。

### 2. 创建场景

项目当前只有代码骨架，无场景文件。需要在 Cocos Creator 中：

1. 创建 `assets/scenes/Battle.scene`（战斗场景）
2. 将 `GameManager` 挂到根节点
3. 添加子节点并挂载各管理器组件（参照下方架构图）
4. 绑定引用关系（在 Inspector 面板中拖拽）

### 3. 构建微信小游戏

在 Cocos Creator 中：`项目 → 构建发布 → 平台：微信小游戏 → 构建`

构建产物路径：`build/wechatgame/`

### 4. 用微信开发者工具预览

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli open --project /Users/rick/TD/build/wechatgame
```

## 项目架构

```
TD/
├── assets/
│   ├── scenes/                    # 场景文件
│   ├── scripts/
│   │   ├── core/                  # 核心系统
│   │   │   ├── GameManager.ts     # 游戏总管理器（单例）
│   │   │   ├── LevelManager.ts    # 关卡加载与初始化
│   │   │   ├── WaveManager.ts     # 敌人波次调度
│   │   │   ├── PathManager.ts     # 敌人移动路径
│   │   │   ├── GridManager.ts     # 网格地图（塔放置位）
│   │   │   ├── InputManager.ts    # 玩家输入处理
│   │   │   ├── Constants.ts       # 全局常量与枚举
│   │   │   └── EventNames.ts     # 事件名常量
│   │   ├── towers/                # 塔系统
│   │   │   ├── Tower.ts           # 塔基类（攻击/升级/出售）
│   │   │   └── TowerManager.ts    # 塔管理（放置/升级/出售）
│   │   ├── enemies/               # 敌人系统
│   │   │   ├── Enemy.ts           # 敌人基类（移动/生命/减速）
│   │   │   └── EnemyManager.ts   # 敌人管理（对象池/查询）
│   │   ├── bullets/               # 子弹系统
│   │   │   ├── Bullet.ts          # 子弹基类（追踪/命中）
│   │   │   └── BulletManager.ts  # 子弹管理（对象池）
│   │   ├── ui/                    # UI 系统
│   │   │   ├── UIManager.ts       # UI 总管理
│   │   │   ├── HUD.ts             # 顶部信息栏
│   │   │   └── TowerMenu.ts       # 建塔/升级菜单
│   │   ├── data/
│   │   │   └── GameData.ts        # 数据接口定义
│   │   └── utils/
│   │       └── ObjectPool.ts      # 通用对象池
│   ├── configs/                   # 游戏配置（JSON）
│   │   ├── towers.json             # 塔属性
│   │   ├── enemies.json           # 敌人属性
│   │   └── levels/level_01.json   # 关卡数据
│   ├── prefabs/                   # 预制体
│   ├── textures/                  # 图片资源
│   ├── animations/                # 动画
│   └── audio/                     # 音效
├── package.json                   # Cocos 项目配置
├── tsconfig.json                  # TypeScript 配置
└── .gitignore
```

## 游戏设计

### 三种塔

| 塔 | 费用 | 特点 |
|---|---|---|
| 箭塔 | 50 | 高射速、单体伤害 |
| 炮塔 | 100 | 低射速、高伤害、溅射 |
| 魔法塔 | 80 | 中等射速、减速效果 |

### 四种敌人

| 敌人 | 生命 | 速度 | 特点 |
|---|---|---|---|
| 普通兵 | 100 | 80 | 基础敌人 |
| 快速兵 | 60 | 160 | 高速低血 |
| 坦克 | 400 | 40 | 高血低速 |
| BOSS | 1000 | 50 | 关底Boss |

### 关卡

- 第一关：8 点折线路径、24 个建造位、4 波敌人（含 BOSS）
- 关卡数据为 JSON 格式，可扩展多关卡

## 开发约定

- 主分支：`main`，使用 SSH 推送
- 提交信息格式：`<type>: <描述>`（如 `feat: 添加箭塔预制体`）
- `.codebuddy/`、`library/`、`temp/`、`local/`、`build/` 不提交
- 配置数据统一放在 `assets/configs/` 下（JSON 格式）
