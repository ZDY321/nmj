import { Eye, History, Pencil, Save, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import type { ScheduleImportReviewRecord } from "@/shared/types";

export function ScheduleImportHistoryQuickBar({
  reviews,
  openedReviewId,
  editingReviewId,
  reviewTitle,
  reviewNeedsAttention,
  onOpenReview,
  onEditReview,
  onSaveReview,
  onCloseReview
}: {
  reviews: ScheduleImportReviewRecord[];
  openedReviewId: string;
  editingReviewId: string;
  reviewTitle: (review: ScheduleImportReviewRecord) => string;
  reviewNeedsAttention: (review: ScheduleImportReviewRecord) => number;
  onOpenReview: (review: ScheduleImportReviewRecord) => void;
  onEditReview: (review: ScheduleImportReviewRecord) => void;
  onSaveReview: () => void;
  onCloseReview: () => void;
}) {
  if (reviews.length === 0) return null;
  const openedReview = reviews.find((review) => review.id === openedReviewId);
  const isEditing = Boolean(editingReviewId);
  const isViewing = Boolean(openedReview) && !isEditing;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-[14px] border px-3 py-2 ${
        isEditing
          ? "border-[#99f6e4] bg-[#f0fdfa]"
          : isViewing
            ? "border-[#bfdbfe] bg-[#eaf2ff]"
            : "border-[#dbe4ef] bg-[#f8fbff]"
      }`}
    >
      <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-extrabold ${isEditing ? "text-[#0f766e]" : "text-[#1557c2]"}`}>
        <History size={13} className="shrink-0" /> 历史对账
      </span>

      <div className="w-full min-w-0 sm:w-[260px] sm:shrink-0">
        <Select
          aria-label="打开已保存的历史对账"
          value={openedReview?.id ?? ""}
          disabled={isEditing}
          title={isEditing ? "正在编辑历史对账，请先保存或取消编辑后再切换其他月份" : "选择要在下方日历中查看的历史对账"}
          onChange={(event) => {
            const review = reviews.find((item) => item.id === event.target.value);
            if (review) onOpenReview(review);
          }}
          className="h-8 rounded-[8px] px-2.5 pr-8 text-[11px]"
        >
          <option value="">选择历史对账（共 {reviews.length} 个月）</option>
          {reviews.map((review) => {
            const attention = reviewNeedsAttention(review);
            return (
              <option key={review.id} value={review.id}>
                {reviewTitle(review)}{attention > 0 ? ` · 待核对 ${attention}` : " · 已全部核对"}
              </option>
            );
          })}
        </Select>
      </div>

      {openedReview ? (
        <>
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white ${isEditing ? "bg-[#0f766e]" : "bg-[#1557c2]"}`}>
            {isEditing ? <Pencil size={11} /> : <Eye size={11} />}
            {isEditing ? "正在编辑" : "只读查看"}
          </span>
          {isViewing && (
            <button
              type="button"
              onClick={() => onEditReview(openedReview)}
              title="把这条历史记录载入当前工作区继续编辑，会与当前云端课表重新比较"
              className="inline-flex shrink-0 items-center gap-1 rounded-[6px] border border-[#99f6e4] bg-[#f0fdfa] px-2 py-1 text-[10px] font-extrabold text-[#0f766e] hover:bg-[#ccfbf1]"
            >
              <Pencil size={11} /> 继续编辑
            </button>
          )}
          {isEditing && (
            <button
              type="button"
              onClick={onSaveReview}
              title="保存当前修改并更新这条历史对账"
              className="inline-flex shrink-0 items-center gap-1 rounded-[6px] border border-[#0f766e] bg-[#0f766e] px-2 py-1 text-[10px] font-extrabold text-white hover:bg-[#115e59]"
            >
              <Save size={11} /> 保存历史修改
            </button>
          )}
          <button
            type="button"
            onClick={onCloseReview}
            title={isEditing ? "取消编辑并返回进入历史前的对账现场" : "退出历史查看并返回之前的对账现场"}
            className="inline-flex shrink-0 items-center gap-1 rounded-[6px] border border-[#cbd6e3] bg-white px-2 py-1 text-[10px] font-extrabold text-[#25324a] hover:bg-[#f8fbff]"
          >
            <X size={11} /> {isEditing ? "取消编辑" : "退出查看"}
          </button>
        </>
      ) : null}
    </div>
  );
}
