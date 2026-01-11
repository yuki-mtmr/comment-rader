# Google Gemini API セットアップガイド

このガイドでは、CommentRadarで使用するGoogle Gemini APIの認証情報を取得する方法を説明します。

## Gemini APIを推奨する理由

- **無料枠が充実**: 毎分15リクエスト、毎分100万トークンまで無料
- **高速**: Gemini 2.0 Flash は超高速レスポンス
- **コスト効率**: 大量のコメント分析でも無料枠内で収まる可能性が高い
- **高品質**: 感情分析、皮肉検出、文脈理解に優れる

## 手順

### 1. Google AI Studioにアクセス

[Google AI Studio](https://aistudio.google.com/app/apikey) にアクセスします。

### 2. Googleアカウントでログイン

Googleアカウントでサインインしてください。まだアカウントを持っていない場合は作成してください。

### 3. API Keyを作成

1. **"Get API key"** ボタンをクリック
2. **"Create API key"** を選択
3. 既存のGoogle Cloud プロジェクトを選択するか、新規作成
   - 新規作成の場合: **"Create API key in new project"** を選択
4. API Keyが生成されます

### 4. API Keyをコピー

生成されたAPI Keyをコピーして安全な場所に保存してください。

**⚠️ 重要**: API Keyは秘密情報です。Gitにコミットしたり、公開しないでください。

### 5. 環境変数に設定

プロジェクトルートの `.env.local` ファイルを開き、以下を設定します:

```bash
# LLM Engine Selection
LLM_ENGINE=gemini

# Google Gemini API Key
GEMINI_API_KEY=AIzaSy...（ここにコピーしたAPI Keyを貼り付け）

# Mock Engineを無効化（本番のLLM分析を使う場合）
USE_MOCK_ENGINE=false
```

### 6. 動作確認

開発サーバーを起動して、API Keyが正しく設定されているか確認します:

```bash
npm run dev
```

## 料金と制限

### 無料枠（Gemini 2.0 Flash）

- **リクエスト数**: 毎分15リクエスト、毎日1,500リクエスト
- **トークン数**: 毎分100万トークン、毎日150万トークン
- **レート制限**: 毎分15 RPM (Requests Per Minute)

### CommentRadarでの使用例

- 1回の分析で20-50コメントをバッチ処理
- 1動画あたり約5-10リクエスト（500コメントの場合）
- 無料枠で毎日100-150動画分析可能

## OpenAIからの切り替え

OpenAI APIからGemini APIに切り替える場合:

1. `.env.local` で `LLM_ENGINE=gemini` に設定
2. `GEMINI_API_KEY` を設定
3. `OPENAI_API_KEY` はコメントアウト（または削除）

両方のAPIキーを持っている場合、`LLM_ENGINE` 環境変数で簡単に切り替え可能です。

## トラブルシューティング

### エラー: "API key not valid"

- API Keyが正しくコピーされているか確認
- `.env.local` ファイルに余分なスペースや改行がないか確認
- 開発サーバーを再起動（環境変数の変更後は必須）

### エラー: "Quota exceeded"

- 無料枠の制限に達しました
- 数分待ってから再試行
- または、リクエスト頻度を減らす

### エラー: "Model not found"

- 使用しているモデル名を確認
- 推奨: `gemini-2.0-flash-exp` または `gemini-1.5-flash`

## 参考リンク

- [Google AI Studio](https://aistudio.google.com/)
- [Gemini API ドキュメント](https://ai.google.dev/docs)
- [料金ページ](https://ai.google.dev/pricing)
- [クイックスタートガイド](https://ai.google.dev/gemini-api/docs/quickstart)
