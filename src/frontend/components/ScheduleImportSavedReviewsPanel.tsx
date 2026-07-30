import { CalendarDays, Trash2 } from "lucide-react";
import type { ScheduleImportReviewRecord } from "@/shared/types";
import { savedScheduleImportReviewLimit } from "@/frontend/lib/scheduleImportReview";

export function ScheduleImportSavedReviewsPanel({
  reviews,
  openedReviewId,
  reviewTitle,
  reviewNeedsAttention,
  onOpenReview,
  onDeleteReview
}: {
  reviews: ScheduleImportReviewRecord[];
  openedReviewId: string;
  reviewTitle: (review: ScheduleImportReviewRecord) => string;
  reviewNeedsAttention: (review: ScheduleImportReviewRecord) => number;
  onOpenReview: (review: ScheduleImportReviewRecord) => void;
  onDeleteReview: (review: ScheduleImportReviewRecord) => void;
}) {
  if (reviews.length === 0) return null;

  return (
    <div className="rounded-[14px] border border-[#dbe4ef] bg-white p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-sm font-extrabold text-[#061226]">
            <CalendarDays size={16} className="text-[#1557c2]" />
            已保存对账
          </div>
          <div className="mt-1 text-xs font-semibold text-[#64748b]">最多保留最近 {savedScheduleImportReviewLimit} 次，当前 {reviews.length} 次。</div>
        </div>
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
          {reviews.slice(0, 8).map((review) => (
            <div
              key={review.id}
              className={`flex shrink-0 items-stretch overflow-hidden rounded-[10px] border text-left text-xs font-bold transition-colors ${
                openedReviewId === review.id ? "border-[#1557c2] bg-[#eaf2ff] text-[#1557c2]" : "border-[#e8eef6] bg-[#f8fbff] text-[#25324a]"
              }`}
            >
              <button
                type="button"
                aria-label={`在下方日历中打开${reviewTitle(review)}`}
                onClick={() => onOpenReview(review)}
                className="px-3 py-2 text-left hover:bg-white/70"
              >
                <span className="block">{reviewTitle(review)}</span>
                <span className="mt-0.5 block text-[10px] text-[#64748b]">{review.rawLessonCount} 节教务 · 待核对 {reviewNeedsAttention(review)}</span>
              </button>
              <button
                type="button"
                title="删除保存的对账结果"
                aria-label={`删除${reviewTitle(review)}`}
                onClick={() => onDeleteReview(review)}
                className="border-l border-[#dbe4ef] px-2 text-[#b91c1c] hover:bg-[#fee2e2]"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
