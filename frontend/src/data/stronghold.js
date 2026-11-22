// 据点建筑、游历与解锁数据

export const buildCost = [5, 3]
const upgradeCosts = [
  [5, 3], [10, 5], [15, 7], [20, 10], [30, 15],
  [40, 20], [50, 25], [60, 30], [80, 40],
]

function levelRows(intervals, storageHours, yields) {
  return storageHours.map((hours, index) => ({
    secondsPerYield: intervals[index],
    storageHours: hours,
    yieldAmount: yields?.[index] ?? 1,
    nextCost: upgradeCosts[index],
  }))
}

const standardHours = [8, 8, 8, 8, 8, 10, 10, 10, 10, 10]
const specialtyLevels = levelRows(
  [3600, 2571, 2000, 1636, 1384, 1200, 1058, 947, 857, 782],
  [8, 8, 10, 10, 10, 12, 12, 12, 12, 12],
)

export const buildings = {
  商行: {
    product: '五铢钱',
    unit: '枚',
    material: '漆器',
    levels: levelRows(Array(10).fill(60), standardHours, [25, 26, 28, 30, 31, 33, 35, 36, 38, 40]),
  },
  书馆: {
    product: '兵书残卷',
    unit: '件',
    material: '竹书',
    levels: levelRows([3600, 2769, 2250, 1894, 1636, 1440, 1285, 1161, 1058, 972], standardHours),
  },
  歌楼: { product: '粮草', unit: '件', material: '楚琴', levels: specialtyLevels },
  驿馆: { product: '白盐', unit: '件', material: '蒲桃酒', levels: specialtyLevels },
  织户: { product: '织物', unit: '件', material: '织锦梭', levels: specialtyLevels },
}

function sameRewards(...items) {
  return [items, items, items]
}

const lateCityRewards = sameRewards('瑛琼瑶', '突破材料包', '突破材料自选包')

export const cities = [
  {
    name: '广陵', rank: 10, specialty: '歌楼', prerequisites: [],
    rebuild: ['竹简', '低光荷', '香兰'],
    rewards: [['鸢羽', '浊酒'], ['鸢羽', '清酒'], ['鸢羽', '百末旨酒']],
  },
  {
    name: '雒阳', alias: '洛阳', rank: 18, specialty: '驿馆', prerequisites: ['广陵'],
    rebuild: ['寻帝', '雅乐', '鸩酒'],
    rewards: [['蒹葭', '绢扇'], ['蒹葭', '翠扇'], ['蒹葭', '金丝扇']],
  },
  {
    name: '东阳', rank: 24, specialty: '歌楼', prerequisites: ['雒阳'],
    rebuild: ['钥匙', '袁氏', '令牌'],
    rewards: [['解谪瓶', '铜镜', '偃师·严阵以待'], ['解谪瓶', '六博镜', '偃师·严阵以待'], ['解谪瓶', '鎏金镜', '偃师·严阵以待']],
  },
  {
    name: '江都', rank: 30, specialty: '驿馆', prerequisites: ['东阳'],
    rebuild: ['丹阳', '孙氏', '灭道'],
    rewards: sameRewards('醉骨草', '蒹葭'),
  },
  {
    name: '偃师', rank: 33, specialty: '歌楼', prerequisites: ['东阳'],
    rebuild: ['石牌', '石雕', '芍药'],
    rewards: [['低光荷', '绢扇', '丹阳·万林虎啸'], ['低光荷', '翠扇', '丹阳·万林虎啸'], ['低光荷', '金丝扇', '丹阳·万林虎啸']],
  },
  {
    name: '寿春', rank: 48, specialty: '歌楼', prerequisites: ['江都'],
    rebuild: ['桃枝', '虎符', '马鞍'],
    rewards: [['金错刀', '浊酒', '铁胎弓'], ['金错刀', '清酒', '铁胎弓'], ['金错刀', '百末旨酒', '铁胎弓']],
  },
  {
    name: '丹阳', rank: 40, specialty: '驿馆', prerequisites: ['偃师'],
    rebuild: ['牙牌', '短戟', '书香'],
    rewards: [['低光荷', '铜镜'], ['低光荷', '六博镜'], ['低光荷', '鎏金镜']],
  },
  {
    name: '彭城', rank: 50, specialty: '驿馆', prerequisites: ['寿春', '丹阳'],
    rebuild: ['陶氏', '并蒂莲', '狼牙'],
    rewards: sameRewards('金错刀', '彩纹盾', '青铜刀'),
  },
  {
    name: '琅琊', rank: 52, specialty: '歌楼', prerequisites: ['彭城'],
    rebuild: ['六博棋', '菟丝', '玉簪'],
    rewards: sameRewards('金错刀', '震天鼓', '梦魂兰'),
  },
  {
    name: '下邳', rank: 60, specialty: '驿馆', prerequisites: ['彭城', '琅琊'],
    rebuild: ['瓦当', '木犁', '栗实'],
    rewards: lateCityRewards,
  },
  {
    name: '郿坞', rank: 65, specialty: '歌楼', prerequisites: ['下邳'],
    rebuild: ['秬鬯', '铜缶', '莲叶'],
    rewards: lateCityRewards,
  },
  {
    name: '涿郡', rank: 70, specialty: '织户', prerequisites: ['郿坞'],
    rebuild: ['浮屠', '指南', '石经'],
    rewards: sameRewards('紫云英', '蜻蜓眼', '木兰坠露'),
  },
]
