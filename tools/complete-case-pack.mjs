// One-time migration of the fixed sample. The resulting server JSON is the runtime source.
import {readFileSync,writeFileSync} from 'node:fs';
const path='backend/src/main/resources/cases/tingyuxuan-2.json';
const c=JSON.parse(readFileSync(path));
c.exploration.actions=[
 {action:'inspect',target:'register',event:'inspect:register',items:['loan-register'],clues:['C09'],text:'你在账房桌上找到借衣登记。原文已进入证据板【C09】，登记副本放入共享背包。登记只能证明谁借衣，不能证明之后一直由谁穿着。'},
 {action:'inspect',target:'coat',event:'inspect:coat',items:['coat-observation'],clues:[],text:'按巡警准许的搜查范围，你查看明轩卧室箱底的蓝外套：左袖旧补丁缺了一角。将观察记入共享背包；可与暖阁门钉上的布片对照。'},
 {action:'inspect',target:'cloth',event:'inspect:cloth',items:['fabric-observation'],clues:[],text:'你检查巡警封存的暖阁门钉蓝布片：一侧边缘不规则。它与门锁处的白棉纤维是两种不同材料，不能混为一谈。'},
 {action:'inspect',target:'chen',items:[],clues:[],text:'陈伯：你可以出示借衣登记。我能确认自己的见闻，却没有看到任何人行凶。'},
 {action:'present',target:'chen',itemId:'loan-register',requires:['loan-register'],event:'chen-register',items:['chen-comparison'],clues:['C06'],blocked:'请先在账房取得借衣登记，再向陈伯出示。',text:'陈伯看过登记：‘名字确是苏明轩。21:31 我见他穿蓝外套从暖阁外门方向走来，但没看见有人行凶。你们应核对外套破口，再查阿福的门钉记录。’ 对照方向已记入共享背包。'},
 {action:'compare',target:'coat-fabric',requires:['chen-comparison','coat-observation','fabric-observation'],event:'coat-fabric',items:['comparison-note'],clues:['C10'],reward:'H01',blocked:'先取得登记、向陈伯出示，并分别检查蓝外套与布片。',text:'对照记录 H01：在原检验记录允许的范围内，布片边缘与蓝外套的破口相合。这印证物品来源，仍需【C11】判断破损时间，不能单靠外套定罪。'}
];
c.exploration.hiddenClues=[{id:'H01',event:'coat-fabric',sourceClueIds:['C10'],boundary:'只支持物品来源，不能独自确定时间或行凶者。',crossCheck:['C06','C11'],required:false}];
c.exploration.dialogues={chen:{id:'npc:chen',name:'陈伯',record:'C06',topics:['当晚的行踪','蓝外套与借衣登记'],default:'21:10 我见明轩离开书房；21:31 见他穿蓝外套从暖阁外门方向走来；21:45 林医生来敲门。我没有看到任何人行凶。原始记录见【C06】。',withRegister:'借衣登记上的名字是苏明轩。21:31 我见他穿蓝外套，从暖阁外门方向走来。我没看见任何人行凶。请把衣服破口与阿福的记录一起核对。'},diary:{id:'npc:diary',name:'日记回响',record:'C12',topics:['用药与遗嘱','记录的信息边界'],boundary:'这些是案发当日的生前记录，只能解释作者当时的想法，不能得知或见证死后发生的事情。'}};
writeFileSync(path,JSON.stringify(c,null,2));
