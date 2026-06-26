import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, Clipboard, Download, ExternalLink, FileCode2, FileSpreadsheet, Globe2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const tampermonkeyEdgeUrl = "https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd";
const tampermonkeyDownloadUrl = "https://www.tampermonkey.net/?browser=edge";
const schoolPalUrl = "https://pro.schoolpal.cn/";
const scriptUrl = "schoolpal-export-helper.user.js";

const linkClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-[#bfdbfe] bg-[#eaf2ff] px-3 py-2 text-sm font-extrabold text-[#1557c2] transition-colors hover:border-[#93c5fd] hover:bg-[#dbeafe]";

export function PayrollScheduleExportGuide() {
  const [scriptText, setScriptText] = useState("");
  const [scriptLoadError, setScriptLoadError] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    fetch(scriptUrl, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`脚本读取失败：${response.status}`);
        return response.text();
      })
      .then((text) => {
        if (cancelled) return;
        setScriptText(text);
        setScriptLoadError("");
      })
      .catch(() => {
        if (cancelled) return;
        setScriptLoadError("脚本内容读取失败，请重新刷新页面。");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyScript() {
    if (!scriptText) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(scriptText);
      } else {
        copyTextWithFallback(scriptText);
      }
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-2 border-[#bfdbfe]">
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#1557c2]">
                <FileSpreadsheet size={14} /> 校宝课表导出
              </div>
              <CardTitle>教务 Excel 导出与脚本安装指引</CardTitle>
              <CardDescription className="mt-2">
                先安装 Tampermonkey，再导入你已有的校宝辅助脚本，最后从校宝教务中心导出课表 Excel 后回到对账页导入。
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="sky">适用 pro.schoolpal.cn</Badge>
              <Badge variant="sage">脚本本地运行</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={tampermonkeyEdgeUrl} target="_blank" rel="noreferrer" className={linkClass}>
              <Download size={15} /> Edge 加载项安装
            </a>
            <a href={tampermonkeyDownloadUrl} target="_blank" rel="noreferrer" className={linkClass}>
              <Globe2 size={15} /> Tampermonkey 官网
            </a>
            <a href={schoolPalUrl} target="_blank" rel="noreferrer" className={linkClass}>
              <ExternalLink size={15} /> 打开校宝
            </a>
          </div>
        </CardHeader>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#5161d6]">
                <FileCode2 size={14} /> 油猴脚本
              </div>
              <CardTitle className="text-lg">校宝查看与导出助手</CardTitle>
              <CardDescription className="mt-2">复制脚本全文后，在 Tampermonkey 管理面板中新建脚本并粘贴保存。</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void copyScript()} disabled={!scriptText}>
                <Clipboard size={14} /> {copyState === "copied" ? "已复制" : "复制脚本全文"}
              </Button>
              <a href={scriptUrl} download="校宝查看与导出助手-0.1.0.user.js" className={linkClass}>
                <Download size={15} /> 下载脚本
              </a>
            </div>
          </div>
          {copyState === "error" && (
            <div className="rounded-[12px] border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm font-bold text-[#b91c1c]">
              复制失败，请手动选中下方脚本内容复制。
            </div>
          )}
          {scriptLoadError && (
            <div className="rounded-[12px] border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-sm font-bold text-[#9a3412]">
              {scriptLoadError}
            </div>
          )}
        </CardHeader>
        <CardContent>
          <pre className="max-h-[360px] overflow-auto rounded-[12px] border border-[#dbe4ef] bg-[#061226] p-4 text-xs font-semibold leading-5 text-[#eaf2ff]">
            {scriptText || scriptLoadError || "正在加载脚本内容..."}
          </pre>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <GuideStep
          icon={<Download size={20} />}
          step="1"
          title="安装油猴扩展"
          tone="blue"
          items={[
            "推荐使用 Microsoft Edge 加载项里的 Tampermonkey，国内网络通常比 Google 扩展商店稳定。",
            "安装后在浏览器右上角扩展列表里确认 Tampermonkey 已启用。",
            "如果 Edge 加载项打不开，可以进入 Tampermonkey 官网下载页选择当前浏览器。"
          ]}
        />
        <GuideStep
          icon={<FileCode2 size={20} />}
          step="2"
          title="导入校宝脚本"
          tone="purple"
          items={[
            "打开 Tampermonkey 管理面板，选择新建脚本。",
            "删除默认模板，把你已有的校宝辅助脚本全文粘贴进去。",
            "保存并启用脚本，确认脚本匹配的网站包含 pro.schoolpal.cn。"
          ]}
        />
        <GuideStep
          icon={<FileSpreadsheet size={20} />}
          step="3"
          title="导出教务 Excel"
          tone="orange"
          items={[
            "登录校宝后进入教务中心，再进入排课页面。",
            "按脚本提供的入口或页面提示切换到对账所需的课表状态。",
            "导出 .xls 或 .xlsx 文件后，回到教务课表对账页拖拽导入。"
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#15803d]">
              <ShieldCheck size={14} /> 使用前检查
            </div>
            <CardTitle className="text-lg">导入前确认</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm font-semibold leading-6 text-[#25324a]">
            <CheckItem text="文件来自校宝教务中心的排课导出，不是截图或网页另存。" />
            <CheckItem text="导出的日期范围覆盖本次工资核对月份。" />
            <CheckItem text="文件名尽量带校区名称，方便系统自动对应校区。" />
            <CheckItem text="多个校区可以分别导出多个 Excel，再一起导入对账页。" />
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#5161d6]">
              <Clipboard size={14} /> 常见处理
            </div>
            <CardTitle className="text-lg">脚本没有生效时</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm font-semibold leading-6 text-[#25324a]">
            <CheckItem text="确认 Tampermonkey 扩展处于启用状态。" />
            <CheckItem text="确认脚本列表里该脚本已启用。" />
            <CheckItem text="刷新校宝页面后再进入教务中心的排课页面。" />
            <CheckItem text="确认当前网址是 pro.schoolpal.cn，脚本匹配地址不要填错。" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function copyTextWithFallback(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("copy failed");
}

function GuideStep({
  icon,
  step,
  title,
  tone,
  items
}: {
  icon: ReactNode;
  step: string;
  title: string;
  tone: "blue" | "purple" | "orange";
  items: string[];
}) {
  const toneClass = tone === "blue"
    ? "bg-[#eaf2ff] text-[#1557c2]"
    : tone === "purple"
      ? "bg-[#eef0ff] text-[#5161d6]"
      : "bg-[#fff3e4] text-[#c2410c]";
  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] ${toneClass}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <Badge variant="secondary">步骤 {step}</Badge>
            <div className="mt-1 text-base font-extrabold text-[#061226]">{title}</div>
          </div>
        </div>
        <div className="space-y-2">
          {items.map((item) => (
            <CheckItem key={item} text={item} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CheckItem({ text }: { text: string }) {
  return (
    <div className="flex gap-2 text-sm font-semibold leading-6 text-[#25324a]">
      <CheckCircle2 size={15} className="mt-1 shrink-0 text-[#16a34a]" />
      <span>{text}</span>
    </div>
  );
}
