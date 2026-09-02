import { Sparkles } from 'lucide-react';

const PROMPT_SECTION_LABELS = [
  '主体', '人物', '角色', '产品', '场景', '背景', '风格', '构图', '镜头', '视角', '光线', '色彩', '材质', '细节', '动作', '文字',
  '负面提示词', '避免事项', '分辨率要求', '质量', '参考图', '延续关系', '基于画布',
  'Subject', 'Character', 'Product', 'Scene', 'Background', 'Style', 'Composition', 'Camera', 'View', 'Light', 'Lighting',
  'Color', 'Material', 'Details', 'Action', 'Text', 'Negative prompt', 'Avoid', 'Resolution', 'Reference', 'Lineage'
];

// Only treat an explicit section label as a heading when it starts a line or
// follows sentence punctuation. This keeps ordinary prose such as
// "resolution: ..." from swallowing the whole prompt into a resolution block.
const PROMPT_SECTION_PATTERN = new RegExp(`(?:^|[\\n.;。！？])\\s*(${PROMPT_SECTION_LABELS.map((label) => label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')).join('|')})\\s*[:：]`, 'gim');

function trimPromptBody(value) {
  return String(value || '')
    .replace(/^[\s,，;；。:：-]+/, '')
    .replace(/[\s,，;；]+$/, '')
    .trim();
}

function splitLabeledPromptBlock(block, fallbackTitle) {
  const text = String(block || '').trim();
  if (!text) return [];
  const matches = [...text.matchAll(PROMPT_SECTION_PATTERN)];
  if (!matches.length) return [];
  const sections = [];
  const prefix = trimPromptBody(text.slice(0, matches[0].index));
  if (prefix) sections.push({ title: fallbackTitle, body: prefix });
  sections.push(...matches.map((match, index) => {
    const nextMatch = matches[index + 1];
    const body = trimPromptBody(text.slice(match.index + match[0].length, nextMatch?.index ?? text.length));
    return {
      title: match[1],
      body
    };
  }).filter((item) => item.body));
  return sections;
}

function promptSectionsFromText(value, t = (key, fallback) => fallback || key) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  const fallbackTitle = t('lightbox.promptDefaultTitle', '提示词');
  const blocks = text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const sections = [];

  blocks.forEach((block) => {
    const labeled = splitLabeledPromptBlock(block, fallbackTitle);
    if (labeled.length) {
      sections.push(...labeled);
      return;
    }

    const lines = block.split('\n').map((item) => item.trim()).filter(Boolean);
    if (lines.length > 1) {
      lines.forEach((line, lineIndex) => {
        const lineLabeled = splitLabeledPromptBlock(line, fallbackTitle);
        if (lineLabeled.length) {
          sections.push(...lineLabeled);
        } else {
          sections.push({ title: `${fallbackTitle} ${sections.length + lineIndex + 1}`, body: line });
        }
      });
      return;
    }

    const sentenceParts = block.length > 140
      ? block.split(/(?:；|;\s+|。\s+|(?<=\.)\s+)/).map((item) => trimPromptBody(item)).filter(Boolean)
      : [];
    if (sentenceParts.length > 1) {
      sentenceParts.forEach((part, partIndex) => {
        sections.push({ title: `${fallbackTitle} ${sections.length + partIndex + 1}`, body: part });
      });
      return;
    }

    sections.push({ title: fallbackTitle, body: block });
  });

  return sections;
}

export function PromptSectionList({ prompt, t = (key, fallback) => fallback || key }) {
  const sections = promptSectionsFromText(prompt, t);
  if (!sections.length) {
    return <p className="promptEmptyText">{t('lightbox.noPrompt', '没有记录提示词')}</p>;
  }
  return (
    <div className="promptSectionList">
      {sections.map((section, index) => (
        <section className="promptSection" key={`${section.title}-${index}`}>
          <span>{section.title}</span>
          <p>{section.body}</p>
        </section>
      ))}
    </div>
  );
}

export function PromptSuggestion({ suggestion, onMerge, onReplace, onCopy, onUse, t = (key, fallback) => fallback || key }) {
  if (!suggestion) return null;
  const rows = [
    [t('suggestion.subject', '保留主体'), suggestion.subject],
    [t('suggestion.scene', '场景变化'), suggestion.scene],
    [t('suggestion.composition', '构图方向'), suggestion.composition],
    [t('suggestion.style', '风格语气'), suggestion.style],
    [t('suggestion.lighting', '光线色彩'), suggestion.lighting],
    [t('suggestion.details', '补充细节'), suggestion.details],
    [t('suggestion.textRules', '文字规则'), suggestion.textRules],
    [t('suggestion.constraints', '避免事项'), suggestion.constraints]
  ].filter(([, value]) => String(value || '').trim());
  const finalPrompt = suggestion.finalPrompt || suggestion.raw || '';
  const finalSections = promptSectionsFromText(finalPrompt, t).slice(0, 4);
  const fallbackRows = rows.slice(0, 5);
  const suggestionSections = finalSections.length
    ? finalSections
    : fallbackRows.map(([title, body]) => ({ title, body }));

  return (
    <div className="promptSuggestion composerMessage assistant">
      <span>AI</span>
      <div className="promptSuggestionBody">
        <div className="promptSuggestionLead">
          <strong>{t('suggestion.title', '本轮提示词建议')}</strong>
          <small>{t('suggestion.hint', 'AI 只整理方向，不自动覆盖当前输入')}</small>
        </div>
        {finalSections.length ? (
          <span className="promptSuggestionFinalLabel">{t('suggestion.finalPrompt', '可执行提示词')}</span>
        ) : null}
        {suggestionSections.length ? (
          <div className="promptSuggestionText">
            {suggestionSections.map((section, index) => (
              <p key={`${section.title}-${index}`}>
                <em>{section.title}</em>
                <span>{section.body}</span>
              </p>
            ))}
          </div>
        ) : finalPrompt ? (
          <p className="promptSuggestionPlain">{finalPrompt}</p>
        ) : (
          <div className="promptSuggestionText">
            {fallbackRows.map(([label, value]) => (
              <p key={label}>
                <b>{label}</b>
                <span>{value}</span>
              </p>
            ))}
          </div>
        )}
        <div className="promptSuggestionActions">
          {onUse ? (
            <button type="button" onClick={onUse}>
              <Sparkles size={13} />
              {t('suggestion.useThis', '用这版生成')}
            </button>
          ) : null}
          <button type="button" onClick={onReplace}>{t('composer.putIntoInput', '放入输入框')}</button>
        </div>
      </div>
    </div>
  );
}

export function CreativeRecipeBar({ recipes, activeId, onApply, t = (key, fallback) => fallback || key }) {
  if (!recipes?.length) return null;
  return (
    <div className="creativeRecipeBar">
      <div className="recipeBarHead">
        <span>{t('recipe.title', '创作配方')}</span>
        <em>{t('recipe.hint', '来自参考项目的场景预设思路，可一键套用到当前参数')}</em>
      </div>
      <div className="recipeScroller">
        {recipes.map((recipe) => (
          <button
            type="button"
            className={activeId === recipe.id ? 'active' : ''}
            key={recipe.id}
            onClick={() => onApply(recipe)}
          >
            <strong>{recipe.title}</strong>
            <span>{recipe.tone}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
