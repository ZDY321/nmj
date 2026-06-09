import type { Dispatch, FormEvent, SetStateAction } from "react";
import { motion } from "framer-motion";
import { Building2, MapPin, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Campus, TeacherVault } from "@/shared/types";

type ConfirmRequest = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "normal";
  onConfirm: () => void;
};

type CampusSettingsCardProps = {
  archiveRowClass: (panel: "campuses", id: string) => string;
  campusAddressInput: string;
  campusInUse: (campusId: string) => boolean;
  campusNameInput: string;
  campusNoteInput: string;
  campusOptions: Campus[];
  confirm: (request: ConfirmRequest) => void;
  editingCampus: Campus | null;
  flashArchiveRow: (panel: "campuses", id: string) => void;
  onAddCampus: (event: FormEvent) => void;
  onDeleteCampus: (campusId: string) => void;
  onUpdateCampus: (campus: Campus) => void;
  setCampusAddressInput: Dispatch<SetStateAction<string>>;
  setCampusNameInput: Dispatch<SetStateAction<string>>;
  setCampusNoteInput: Dispatch<SetStateAction<string>>;
  setEditingCampus: Dispatch<SetStateAction<Campus | null>>;
  vault: TeacherVault;
};

export function CampusSettingsCard({
  archiveRowClass,
  campusAddressInput,
  campusInUse,
  campusNameInput,
  campusNoteInput,
  campusOptions,
  confirm,
  editingCampus,
  flashArchiveRow,
  onAddCampus,
  onDeleteCampus,
  onUpdateCampus,
  setCampusAddressInput,
  setCampusNameInput,
  setCampusNoteInput,
  setEditingCampus,
  vault
}: CampusSettingsCardProps) {
  return (
    <Card className="h-fit overflow-hidden">
      <CardHeader className="gap-3">
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-[#ff8617]" />
            <CardTitle className="text-lg">校区与班型</CardTitle>
          </div>
          <Badge variant="secondary">{vault.campuses.length} 个</Badge>
        </div>
        <form onSubmit={onAddCampus} className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]">
          <Input
            value={campusNameInput}
            onChange={(event) => setCampusNameInput(event.target.value)}
            placeholder="校区名称，例如：中心校区"
          />
          <Input
            value={campusAddressInput}
            onChange={(event) => setCampusAddressInput(event.target.value)}
            placeholder="地址，例如：人民路 88 号"
          />
          <Input
            value={campusNoteInput}
            onChange={(event) => setCampusNoteInput(event.target.value)}
            placeholder="备注，可选"
          />
          <Button type="submit">
            <Plus size={15} /> 添加校区
          </Button>
        </form>
      </CardHeader>
      <CardContent className="max-h-[520px] space-y-0 overflow-y-auto pr-2">
        {campusOptions.map((campus) => {
          const isEditing = editingCampus?.id === campus.id;
          const used = campusInUse(campus.id);
          return (
            <motion.div
              key={campus.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={archiveRowClass("campuses", campus.id)}
            >
              {isEditing && editingCampus ? (
                <div className="space-y-3">
                  <Input
                    value={editingCampus.name}
                    onChange={(event) => setEditingCampus({ ...editingCampus, name: event.target.value })}
                    placeholder="校区名称"
                  />
                  <Input
                    value={editingCampus.address ?? ""}
                    onChange={(event) => setEditingCampus({ ...editingCampus, address: event.target.value })}
                    placeholder="地址"
                  />
                  <Input
                    value={editingCampus.note ?? ""}
                    onChange={(event) => setEditingCampus({ ...editingCampus, note: event.target.value })}
                    placeholder="备注"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (!editingCampus.name.trim()) return;
                        const campusId = editingCampus.id;
                        onUpdateCampus({ ...editingCampus, name: editingCampus.name.trim() });
                        setEditingCampus(null);
                        flashArchiveRow("campuses", campusId);
                      }}
                    >
                      <Save size={14} /> 保存
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        flashArchiveRow("campuses", editingCampus.id);
                        setEditingCampus(null);
                      }}
                    >
                      <X size={14} /> 取消
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eaf2ff]">
                    <Building2 size={16} className="text-[#1557c2]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{campus.name}</span>
                    <span className="mt-1 flex items-center gap-1 text-xs text-(--color-muted-foreground)">
                      <MapPin size={10} /> {campus.address || "未填写地址"}
                    </span>
                    {campus.note && (
                      <span className="mt-1 block text-xs leading-5 text-(--color-muted-foreground)">
                        {campus.note}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 w-8 rounded-[9px] p-0"
                      title="编辑校区"
                      aria-label={`编辑校区 ${campus.name}`}
                      onClick={() => setEditingCampus(campus)}
                    >
                      <Pencil size={13} />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="h-8 w-8 rounded-[9px] p-0"
                      disabled={used}
                      title={used ? "已有学生、课程或课时引用，不能直接删除" : "删除校区"}
                      aria-label={`删除校区 ${campus.name}`}
                      onClick={() =>
                        confirm({
                          title: `删除校区「${campus.name}」？`,
                          description: "删除后无法从校区与班型中恢复。",
                          confirmLabel: "删除",
                          tone: "danger",
                          onConfirm: () => onDeleteCampus(campus.id)
                        })
                      }
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
        {vault.campuses.length === 0 && (
          <p className="py-8 text-center text-sm text-(--color-muted-foreground)">还没有校区</p>
        )}
      </CardContent>
    </Card>
  );
}
