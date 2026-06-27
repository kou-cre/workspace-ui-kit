import type { AssistantTurn } from "@/lib/brainDump/schema";

/**
 * DEMO_MODE 用の作り込みアシスタント会話（紹介/スクショ用）。
 *
 * デモ案件「フードデリバリー予約システム」(id=p1) の「開発」マイルストーンが過密に
 * なっている状況で、AI が①markdownで状況を整理しつつ、②マイルストーン再構成
 * （別工程へ再配置 / メモへ外す）を理由つきで提案する場面を再現する。
 * noteId・targetMilestone は data/demo-projects.json の実 ID を参照している。
 * 本番では渡さないので、この会話は DEMO_MODE のときだけ表示される。
 */
const turn: AssistantTurn = {
  reply:
    "「開発」マイルストーンに **9件** ぶら下がっていて、性質の違うタスクが混ざっているのが、進捗の見えにくさの原因だと思います。\n\n" +
    "工程ごとに振り分け直すと、こう整理できます。\n\n" +
    "- **店舗オペレーションの2回目ヒアリング** → 要件ヒアリングへ（実装ではなく確認作業）\n" +
    "- **受け入れテストの準備** → 受け入れテストへ\n" +
    "- **決済代行はどこを使うか** → 未着手の検討事項なのでメモへ外す\n\n" +
    "こうすると「開発」は実装タスクだけになり、残りの進み具合が読みやすくなります。下のカードで、移動先を選んで採否を決められます。",
  milestones: [],
  items: [],
  projectUpdate: null,
  itemChanges: [
    {
      noteId: "a1-0",
      noteTitle: "店舗オペレーションの2回目ヒアリング",
      action: "reassign",
      targetMilestone: "hearing",
      reason: "実装作業ではなく要件確認なので、ヒアリング工程に置く方が自然です。",
    },
    {
      noteId: "a1-9",
      noteTitle: "受け入れテストの準備",
      action: "reassign",
      targetMilestone: "delivery",
      reason: "テスト準備は受け入れテスト工程に紐づけると、進捗が追いやすくなります。",
    },
    {
      noteId: "n1-3",
      noteTitle: "決済代行はどこを使うか",
      action: "toMemo",
      targetMilestone: null,
      reason: "まだ着手前の検討事項です。マイルストーンから外し、メモで温めておくのが適切です。",
    },
  ],
};

/** DEMO_MODE 用：アシスタントを開いたときに初期表示する1往復の作り込み会話。 */
export const DEMO_ASSISTANT_SEED = {
  userText:
    "「開発」にタスクが溜まりすぎて、進捗がパッと見えなくなってきました。マイルストーンを整理したいです。",
  turn,
};
