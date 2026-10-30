export const MONITOR_GROUPS=[
 {name:'动力负载',keys:['DriversDemandEngPercentTorque','EngIntakeManifold1Press','EngIntakeManifold1Temp','EngIntakeAirMassFlowRate','EngExhaustGasPress']},
 {name:'后处理排放',keys:['DOCInletTemp','DPFInletTemp','SCRInletTemp','DPFDifferentialPressure','DPFSootLoadPercent','SCRInletNOx','SCROutletNOx','UreaTankLevel','UreaDosingMassRate']},
 {name:'PTO 机具',keys:['PowerTakeoffSpeed']}
];
const item=(n,label,docPgn,docSpn,key,note='')=>({n,label,docPgn,docSpn,key,note});
export const DOCUMENT_SIGNALS=[
 item(1,'发动机转速',61444,190,'EngSpeed'),item(2,'实际扭矩百分比',61444,513,'ActualEngPercentTorque'),item(3,'油门踏板开度',61444,55,'AccelPedalPos1','DBC 为 EEC2 / 0xF003；文档的报文归属及 SPN 需核对'),item(4,'发动机机油压力',61444,100,'EngOilPress','DBC 为 EFL/P1 / 0xFEEF'),item(5,'冷却液温度',61444,110,'EngCoolantTemp','DBC 为 ET1 / 0xFEEE'),item(6,'瞬时燃油率',61443,183,'EngFuelRate','DBC 为 LFE / 0xFEF2'),
 item(7,'需求目标扭矩',61444,512,'DriversDemandEngPercentTorque','DBC 为驾驶员需求扭矩，不等同于所有内部限扭后的目标扭矩'),item(8,'发动机扭矩模式',61444,899,'EngTorqueMode','DBC 未给文字枚举，显示原始模式码，不推断正常／降功率／再生保护'),item(9,'进气歧管增压压力',61445,102,'EngIntakeManifold1Press','DBC 为 IC1 / 0xFEF6'),item(10,'进气歧管温度',61445,105,'EngIntakeManifold1Temp','DBC 为 IC1 / 0xFEF6'),item(11,'进气空气流量',61445,3700,'EngIntakeAirMassFlowRate','DBC 为 EGF1 / 0xF00A；文档与再生状态重复使用 SPN 3700，不能照抄'),item(12,'排气背压',61445,112,'EngExhaustGasPress','DBC 为 EI / 0xFE92，测点为涡轮前排气表压，不等同于 DPF 压差'),
 {...item(13,'喷油提前角',61443,3414,null),excluded:true,note:'文档标记无效，不加入默认监控'},
 item(14,'DOC 入口温度',64892,3250,'DOCInletTemp','DBC 为 A1DOC / 0xFD20'),item(15,'DPF 入口温度',64892,3251,'DPFInletTemp','DBC 为 AT1IG2 / 0xFDB4；按温度单位和 16 位位置排除同名 FMI 字段'),item(16,'DPF 前后压差',64892,3252,'DPFDifferentialPressure','DBC 为 AT1IMG / 0xFDB2'),item(17,'DPF 碳载量',64892,3719,'DPFSootLoadPercent','DBC 为 AT1S / 0xFD7B，允许按 DBC 范围超过 100%'),
 {...item(18,'DPF 灰分负载',65270,3720,null),excluded:true,note:'文档标记无效，不加入默认监控'},
 item(19,'SCR 入口 NOx',61454,3217,'SCRInletNOx','DBC 为 AT1IG1 / 0xF00E'),item(20,'SCR 出口 NOx',61454,3218,'SCROutletNOx','DBC 为 AT1OG1 / 0xF00F，不与入口共用 PGN'),item(21,'SCR 入口温度',65270,3246,'SCRInletTemp','DBC 为 A1SCREGT / 0xFD3E'),item(22,'尿素喷射流率',64893,3235,'UreaDosingMassRate','DBC 为 A1SCRDSI1 / 0xF023，单位 g/h；换算 mL/s 需输入实际密度'),
 {...item(23,'尿素供给压力',64893,3236,null),excluded:true,note:'文档标记无效，不加入默认监控'},
 item(24,'尿素液位',65271,1761,'UreaTankLevel','DBC 为 AT1TI1 / 0xFE56'),item(25,'再生工作状态',64892,3700,'ActiveRegenStatus','DBC 为 DPFC1 / 0xFD7C，结合被动再生与禁止标志；没有明确中断信号时不推断中断'),item(26,'PTO 输出转速',65192,508,'PowerTakeoffSpeed','DBC 为 PTO / 0xFEF0'),item(27,'PTO 输出扭矩',65192,509,null,'当前 DBC 未找到 N·m 扭矩定义；PTO 设定转速为 rpm，不能当作扭矩')
];
export const POWER_PLOTS=[
 {id:'power-torque',title:'需求扭矩与实际扭矩',keys:['DriversDemandEngPercentTorque','ActualEngPercentTorque'],unit:'%',wide:true},
 {id:'power-response',title:'发动机转速与油门响应',keys:['EngSpeed','AccelPedalPos1'],unit:'rpm',secondUnit:'%'},
 {id:'power-pressure',title:'增压压力与涡轮前排气压力',keys:['EngIntakeManifold1Press','EngExhaustGasPress'],unit:'kPa'},
 {id:'power-airflow',title:'进气空气流量',keys:['EngIntakeAirMassFlowRate'],unit:'kg/h'}
];
export const AFTER_PLOTS=[
 {id:'after-temperatures',title:'后处理各段排温',keys:['DOCInletTemp','DPFInletTemp','SCRInletTemp'],unit:'℃',wide:true},
 {id:'after-dpf-pressure',title:'DPF 前后压差',keys:['DPFDifferentialPressure'],unit:'kPa'},
 {id:'after-nox',title:'SCR 入口与出口 NOx',keys:['SCRInletNOx','SCROutletNOx'],unit:'ppm'},
 {id:'after-dosing',title:'尿素实际喷射流率',keys:['UreaDosingMassRate'],unit:'g/h'}
];
export const MONITOR_CHART_DEFS=[...POWER_PLOTS,...AFTER_PLOTS].map(p=>({key:p.id,title:p.title,unit:p.unit}));
