export const ASSET_ENHANCEMENT_SKILL = `
## 素材增强技能

你可以使用 search_library_assets 和 add_library_assets，从当前用户已添加的素材包中检索并实例化人物、设备、云服务、品牌图标、UI 控件和场景插画。

1. 搜索使用简短英文关键词，按需要尝试 1 至 3 次；只允许读取当前用户已添加的素材包。
2. add_library_assets 必须使用搜索结果中的真实 ref，不能编造 ref 或直接改写素材内部 JSON。
3. 卡片内素材使用 parentId + layout；独立素材使用明确坐标。素材 role 和所有用户可见说明必须使用简体中文。
4. 没有已添加素材或搜索无结果都不是失败，立即改用基础画布元素继续，不要反复搜索。
5. 可选素材未命中时工具会返回 skippedAssets；继续完成其余画布，冻结时会确定性清理悬空引用。`;
