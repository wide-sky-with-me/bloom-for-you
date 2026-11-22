// Camera positions and targets are in the working Blender scene, in metres.
// Convert once at the engine boundary; never reflect the imported glTF root.
export const places = [
  ['arrival','花墅与水庭','玫瑰拱廊前，石径绕过池边。',[2,-33,6.1],[-12,0,6.4],31],
  ['pond','睡莲水庭','石岸围着睡莲，水帘从小桥下落入池中。',[-8.7,-23.8,4.45],[-1.4,-14,2.66],35],
  ['swing','紫藤双人秋千','木架下的两只绣枕，正好并肩坐下。',[-32.6,-20.8,4.75],[-28.5,-14,3.55],36],
  ['light','东港灯塔','沿防波堤到海港尽头，抬头看白石塔上的红环。',[57,-37,10],[78,-10,7.4],35],
  ['mill','北坡风车','站在山坡上，看四片风帆绕过铜色轮轴。',[-26,89,22],[-51,68,22.3],36],
  ['letter','书房信桌','胡桃木桌边，瓶花陪着一封火漆信。',[-8.41,7.51,4.082],[-7.63,8.43,3.602],43],
  ['bay','全岛俯瞰','从海湾回望，认一认花墅、风车和东港的位置。',[61,-158,66],[-1,16,6],34],
].map(([id,name,note,eye,target,lens])=>({id,name,note,eye,target,lens}));
