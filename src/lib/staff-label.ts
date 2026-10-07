// スタッフ選択欄の表示名。名前の一意制約は付けていないので、同じ名前の人がいたら ID の末尾で見分ける
// (役割は選択欄のグループ名と、横の印で出す)

export type StaffForLabel = { id: number; name: string };

export function staffOptionLabel(staff: StaffForLabel, all: StaffForLabel[]): string {
  const sameName = all.filter((s) => s.name === staff.name).length > 1;
  return sameName ? `${staff.name}(ID末尾${String(staff.id).slice(-2)})` : staff.name;
}
