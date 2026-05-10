import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Bell, Database, Lock, Save, ShieldCheck, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TeacherVault } from "@/shared/types";
import { MetricCard } from "@/frontend/components/MetricCard";

export function AdminView({
  vault,
  onNoticeChange,
  onClearData
}: {
  vault: TeacherVault;
  onNoticeChange: (title: string, content: string) => void;
  onClearData: () => void;
}) {
  const [title, setTitle] = useState(vault.notice.title);
  const [content, setContent] = useState(vault.notice.content);

  useEffect(() => {
    setTitle(vault.notice.title);
    setContent(vault.notice.content);
  }, [vault.notice.title, vault.notice.content]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label="注册用户" value="演示 1" hint="正式版只显示账号" variant={1} index={0} />
        <MetricCard label="校区数量" value={`${vault.campuses.length}`} hint="管理员不看明细" variant={2} index={1} />
        <MetricCard label="加密文档" value="本地 1 份" hint="D1 接入后显示状态" variant={3} index={2} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <div className="flex items-center gap-2 text-[#ff8617] text-xs font-bold uppercase tracking-widest mb-1">
                <Bell size={14} /> 公告设置
              </div>
              <CardTitle>系统公告</CardTitle>
              <CardDescription>公告会在登录页和右上角展示</CardDescription>
            </div>
            <Button size="sm" onClick={() => onNoticeChange(title, content)}>
              <Save size={15} /> 保存
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">标题</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">内容</label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-2 text-[#1557c2] text-xs font-bold uppercase tracking-widest mb-1">
              <ShieldCheck size={14} /> 用户管理边界
            </div>
            <CardTitle>隐私策略</CardTitle>
            <CardDescription>管理员只看账户状态，不看老师明细</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: Lock, text: "不显示课程内容" },
                { icon: Users, text: "不显示学生姓名" },
                { icon: Database, text: "不显示课时费明细" },
                { icon: ShieldCheck, text: "不显示校区排课" }
              ].map((item, i) => (
                <motion.div
                  key={item.text}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  whileHover={{ x: 4 }}
                  className="flex items-center gap-3 p-4 rounded-[14px] bg-[#f8fbff] border border-[#dbe4ef]"
                >
                  <div className="w-8 h-8 rounded-[10px] bg-[#eaf2ff] flex items-center justify-center shrink-0">
                    <item.icon size={14} className="text-[#1557c2]" />
                  </div>
                  <span className="text-sm font-medium">{item.text}</span>
                </motion.div>
              ))}
            </div>

            <Button variant="destructive" className="w-full" onClick={onClearData}>
              <Trash2 size={15} /> 删除当前本地演示数据
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
