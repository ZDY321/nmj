import { CalendarDays, Eye, Pencil, Trash2, X } from "lucide-react";
import type { ScheduleImportReviewRecord } from "@/shared/types";
import { savedScheduleImportReviewLimit } from "@/frontend/lib/scheduleImportReview";

export function ScheduleImportSavedReviewsPanel({
  reviews,
  openedReviewId,
  editingReviewId,
  reviewTitle,
  reviewNeedsAttention,
  onOpenReview,
  onEditReview,
  onCloseReview,
  onDeleteReview
}: {
  reviews: ScheduleImportReviewRecord[];
  openedReviewId: string;
  editingReviewId?: string;
  reviewTitle: (review: ScheduleImportReviewRecord) => string;
  reviewNeedsAttention: (review: ScheduleImportReviewRecord) => number;
  onOpenReview: (review: ScheduleImportReviewRecord) => void;
  onEditReview: (review: ScheduleImportReviewRecord) => void;
  onCloseReview: () => void;
  onDeleteReview: (review: ScheduleImportReviewRecord) => void;
}) {
  if (reviews.length === 0) return null;

  return (
    <div className="rounded-[14px] border border-[#dbe4ef] bg-white p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-[#061226]">
            <CalendarDays size={16} className="text-[#1557c2]" />
            已保存对账
            {openedReviewId && (
              <>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white ${editingReviewId ? "bg-[#0f766e]" : "bg-[#1557c2]"}`}>
                  {editingReviewId ? <Pencil size={11} /> : <Eye size={11} />} {editingReviewId ? "正在编辑历史记录" : "正在查看历史记录"}
                </span>
                {!editingReviewId && (
                  <button
                    type="button"
                    onClick={() => {
                      const review = reviews.find((item) => item.id === openedReviewId);
                      if (review) onEditReview(review);
                    }}
                    title="把这条历史记录载入当前工作区继续编辑"
                    className="inline-flex items-center gap-1 rounded-[6px] border border-[#99f6e4] bg-[#f0fdfa] px-2 py-1 text-[10px] font-extrabold text-[#0f766e] hover:bg-[#ccfbf1]"
                  >
                    <Pencil size={11} /> 继续编辑
                  </button>
                )}
                <button
                  type="button"
                  onClick={onCloseReview}
                  title={editingReviewId ? "取消编辑并返回进入历史前的对账现场" : "退出历史查看并返回之前的对账现场"}
                  className="inline-flex items-center gap-1 rounded-[6px] border border-[#cbd6e3] bg-white px-2 py-1 text-[10px] font-extrabold text-[#25324a] hover:bg-[#f8fbff]"
                >
                  <X size={11} /> {editingReviewId ? "取消编辑" : "退出历史查看"}
                </button>
              </>
            )}
          </div>
          <div className="mt-1 text-xs font-semibold text-[#64748b]">每月一份，最多保留最近 {savedScheduleImportReviewLimit} 个月，当前 {reviews.length} 个月。</div>
        </div>
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
          {reviews.slice(0, 8).map((review) => {
            const isOpened = openedReviewId === review.id;
            return (
              <div
                key={review.id}
                className={`flex min-w-[190px] shrink-0 items-stretch overflow-hidden rounded-[10px] border text-left text-xs font-bold transition-all ${
                  isOpened
                    ? "border-[#1557c2] bg-[#1557c2] text-white shadow-[0_8px_18px_rgba(21,87,194,0.24)] ring-2 ring-[#93c5fd] ring-offset-1"
                    : "border-[#e8eef6] bg-[#f8fbff] text-[#25324a] hover:border-[#93c5fd]"
                }`}
              >
                <button
                  type="button"
                  aria-label={`在下方日历中打开${reviewTitle(review)}`}
                  aria-current={isOpened ? "true" : undefined}
                  onClick={() => onOpenReview(review)}
                  className={`min-w-0 flex-1 px-3 py-2 text-left ${isOpened ? "hover:bg-white/10" : "hover:bg-white/70"}`}
                >
                  <span className="block">{reviewTitle(review)}</span>
                  <span className={`mt-0.5 block text-[10px] ${isOpened ? "text-[#dbeafe]" : "text-[#64748b]"}`}>
                    {review.rawLessonCount} 节教务 · 待核对 {reviewNeedsAttention(review)}
                  </span>
                  <span className={`mt-1 flex h-4 items-center gap-1 text-[10px] font-extrabold ${isOpened ? "text-white" : "invisible"}`}>
                    <Eye size={11} /> 正在查看
                  </span>
                </button>
                <button
                  type="button"
                  title="删除保存的对账结果"
                  aria-label={`删除${reviewTitle(review)}`}
                  onClick={() => onDeleteReview(review)}
                  className={`border-l px-2 ${isOpened ? "border-white/25 text-[#fee2e2] hover:bg-[#b91c1c]" : "border-[#dbe4ef] text-[#b91c1c] hover:bg-[#fee2e2]"}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
