graph TD
    A[开始] --> B[处理]
    B --> C{判断}
    C -->|是| D[结束]
    C -->|否| B
graph LR
    A[输入] --> B[输出]
graph RL
    B[输出] --> A[输入]
graph BT
    Z[底部] --> T[顶部]
graph TB
    T[顶部] --> B[底部]
graph TD
    A((圆形)) --> B[矩形]
    B --> C(圆角矩形)
    C --> D>非对称]
    D --> E{菱形}
    E --> F[[子程序]]
    F --> G[(数据库)]
    G --> H{{六边形}}
    H --> I[/平行四边形/]
    I --> J[\反向平行四边形\]
    J --> K[/梯形\]
    K --> L[\反向梯形/]
    L --> M[多行\n文本]
graph LR
    subgraph 分组1
        A1 --> B1
    end
    subgraph 分组2
        A2 --> B2
    end
    B1 --> B2
graph TD
    A---B
    B-->|带文本|C
    C-.->D
    D==>E
    E--oF
    F--xC
graph LR
    A o--o B
    B <--> C
    C x--x D
    D --> E & F
    E --> G
    F --> G
graph TD
    A[开始] -->|流程1| B[步骤1]
    A -->|流程2| C[步骤2]
    B --> D[合并]
    C --> D
sequenceDiagram
    Alice->>John: 你好
    John-->>Alice: 嗨
    Alice->>John: 你还好吗？
    John-->>Alice: 很好！
    John->>John: 自言自语
sequenceDiagram
    participant A as 用户
    participant B as 系统
    A->>B: 请求
    B-->>A: 响应
    B--)A: 异步通知
    Note over A,B: 备注信息
    Note left of A: 左侧备注
    Note right of B: 右侧备注
sequenceDiagram
    loop 循环
        A->>B: 消息
    end
    alt 条件1
        A->>B: 消息A
    else 条件2
        A->>B: 消息B
    end
    opt 可选
        A->>B: 可选消息
    end
    par 并行1
        A->>B: 并行消息
    and 并行2
        A->>C: 并行消息
    end
    critical 关键操作
        A->>B: 关键消息
    option 异常处理
        A->>B: 异常消息
    end
    break 中断
        A->>B: 中断消息
    end
classDiagram
    class Animal
    Animal : +String name
    Animal : +int age
    Animal : +makeSound() void
    class Dog
    Dog --|> Animal
    class Cat
    Cat --|> Animal
    class Bird
    Bird --|> Animal
    class Penguin
    Penguin --|> Animal
    class Zoo
    Zoo *-- Dog
    Zoo *-- Cat
    Zoo *-- Bird
    Zoo *-- Penguin
    class Owner
    Owner --> Zoo
classDiagram
    class 接口 {
        +公共属性
        -私有属性
        #受保护属性
        +公共方法()
        -私有方法()
        #受保护方法()
    }
    class 实现类
    实现类 ..|> 接口
stateDiagram-v2
    [*] --> 待机
    待机 --> 运行: 启动
    运行 --> 暂停: 暂停
    暂停 --> 运行: 恢复
    运行 --> 停止: 停止
    暂停 --> 停止: 停止
    停止 --> [*]
stateDiagram-v2
    state 复合状态 {
        [*] --> 子状态1
        子状态1 --> 子状态2
        子状态2 --> [*]
    }
    [*] --> 复合状态
    复合状态 --> 结束
stateDiagram-v2
    [*] --> 状态1
    状态1 --> 状态2: 事件A
    状态1 --> 状态3: 事件B
    状态2 --> 状态4: 事件C
    状态3 --> 状态4: 事件D
    状态4 --> [*]
stateDiagram-v2
    note right of 状态1: 右侧备注
    note left of 状态2: 左侧备注
    note top of 状态3: 顶部备注
    note bottom of 状态4: 底部备注
gantt
    title 项目计划
    dateFormat YYYY-MM-DD
    section 阶段A
    任务1: a1, 2024-01-01, 30d
    任务2: after a1, 20d
    section 阶段B
    任务3: 2024-02-01, 15d
    任务4: after a1, 25d
gantt
    title 开发周期
    dateFormat YYYY-MM-DD
    section 设计
    需求分析: des1, 2024-01-01, 7d
    架构设计: des2, after des1, 5d
    section 开发
    编码: dev1, after des2, 14d
    测试: dev2, after dev1, 7d
    section 发布
    部署: dep1, after dev2, 3d
    验收: dep2, after dep1, 2d
pie
    title 编程语言分布
    "Python": 40
    "JavaScript": 30
    "Java": 15
    "Go": 10
    "其他": 5
pie
    title 任务分配
    "前端开发": 35
    "后端开发": 35
    "测试": 15
    "运维": 10
    "管理": 5
flowchart TD
    A[开始] --> B{条件}
    B -->|满足| C[处理]
    C --> D[验证]
    D -->|通过| E[结束]
    D -->|失败| B
    B -->|不满足| F[拒绝]
    F --> E
flowchart LR
    A[输入] --> B[步骤1]
    B --> C[步骤2]
    C --> D[输出]
--- 第200行 ---