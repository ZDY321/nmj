import type { ReactNode } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ScheduleImportReviewRecord, TeacherVault } from "@/shared/types";

export function ScheduleImportSavedReviewsPanel({
  vault,
  amountsVisible,
  reviews,
  selectedReview,
  expanded,
  selectedReviewMatchedCount,
  reviewTitle,
  reviewNeedsAttention,
  formatReviewNumber,
  formatReviewAmount,
  onToggleExpanded,
  onSelectReview,
  onDeleteReview,
  renderRows
}: {
  vault: TeacherVault;
  amountsVisible: boolean;
  reviews: ScheduleImportReviewRecord[];
  selectedReview?: ScheduleImportReviewRecord;
  expanded: boolean;
  selectedReviewMatchedCount?: number;
  reviewTitle: (review: ScheduleImportReviewRecord) => string;
  reviewNeedsAttention: (review: ScheduleImportReviewRecord) => number;
  formatReviewNumber: (value: number | undefined) => string;
  formatReviewAmount: (value: number | undefined, visible: boolean) => string;
  onToggleExpanded: () => void;
  onSelectReview: (reviewId: string) => void;
  onDeleteReview: (review: ScheduleImportReviewRecord) => void;
  renderRows: (review: ScheduleImportReviewRecord, vault: TeacherVault) => ReactNode;
}) {
  if (reviews.length === 0) return null;

  return (
    <div className="rounded-[14px] border border-[#dbe4ef] bg-white p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button
            type="button"
            onClick={onToggleExpanded}
            className="inline-flex items-center gap-2 text-sm font-extrabold text-[#061226]"
          >
            <ChevronDown size={16} className={`text-[#64748b] transition-transform ${expanded ? "rotate-180" : ""}`} />
            已保存对账
          </button>
          <div className="mt-1 text-xs font-semibold text-[#64748b]">最近保留 {reviews.length} 次；保存结果可展开查看或删除。</div>
        </div>
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
          {reviews.slice(0, 8).map((review) => (
            <div
              key={review.id}
              className={`flex shrink-0 items-stretch overflow-hidden rounded-[10px] border text-left text-xs font-bold transition-colors ${
                selectedReview?.id === review.id ? "border-[#1557c2] bg-[#eaf2ff] text-[#1557c2]" : "border-[#e8eef6] bg-[#f8fbff] text-[#25324a]"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectReview(review.id)}
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
      {expanded && selectedReview && (
        <div className="mt-3 rounded-[12px] border border-[#e8eef6] bg-[#f8fbff] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="sky">{selectedReview.month}</Badge>
            <Badge variant="secondary">{selectedReview.rawLessonCount} 节教务</Badge>
            <Badge variant="secondary">云端 {formatReviewNumber(selectedReview.summary.systemLessonCount)} 节</Badge>
            <Badge variant="sage">已完成 {formatReviewNumber(selectedReview.summary.systemCompletedLessonCount)} 节</Badge>
            <Badge variant="secondary">课时费 {formatReviewAmount(selectedReview.summary.systemCompletedAmount, amountsVisible)}</Badge>
            <Badge variant="sage">已对应 {selectedReviewMatchedCount ?? selectedReview.summary.matched}</Badge>
            <Badge variant={reviewNeedsAttention(selectedReview) > 0 ? "amber" : "secondary"}>待核对 {reviewNeedsAttention(selectedReview)}</Badge>
          </div>
          {renderRows(selectedReview, vault)}
        </div>
      )}
    </div>
  );
}
