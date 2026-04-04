// ── ContentService: получение контента с метаданными для Figma ─────────────────

import { FigmaLayoutTokens } from '../theme/tokens';

/**
 * Типы контента
 */
export type ContentType = 'photo' | 'icon' | 'text';

/**
 * Метаданные Auto Layout из Figma
 */
export interface FigmaLayoutMetadata {
  padding: string | number;
  spacing: string | number;
  alignment: 'start' | 'center' | 'end' | 'stretch';
}

/**
 * Результат получения контента с метаданными
 */
export interface ContentWithMetadata<T> {
  data: T;
  metadata: {
    type: ContentType;
    figmaLayout?: FigmaLayoutMetadata;
  };
}

/**
 * ContentService — сервис для получения контента с метаданными,
 * соответствующими дизайн-токенам Figma.
 */
export class ContentService {

  /**
   * Получить изображение с метаданными Auto Layout
   */
  getPhoto(src: string): ContentWithMetadata<HTMLImageElement> {
    const img = new Image();
    img.src = src;

    return {
      data: img,
      metadata: {
        type: 'photo',
        figmaLayout: {
          padding: FigmaLayoutTokens.photo.padding,
          spacing: FigmaLayoutTokens.photo.spacing,
          alignment: FigmaLayoutTokens.photo.alignment,
        },
      },
    };
  }

  /**
   * Получить иконку с метаданными Auto Layout
   */
  getIcon(iconName: string): ContentWithMetadata<SVGSVGElement | null> {
    // Заглушка для получения иконки по имени
    // В реальной реализации можно использовать SVG sprite или библиотеку иконок
    const svg = null; // TODO: реализовать загрузку иконки

    return {
      data: svg,
      metadata: {
        type: 'icon',
        figmaLayout: {
          padding: FigmaLayoutTokens.icon.padding,
          spacing: FigmaLayoutTokens.icon.spacing,
          alignment: FigmaLayoutTokens.icon.alignment,
        },
      },
    };
  }

  /**
   * Получить текст с метаданными Auto Layout
   */
  getText(content: string): ContentWithMetadata<string> {
    return {
      data: content,
      metadata: {
        type: 'text',
        figmaLayout: {
          padding: FigmaLayoutTokens.text.padding,
          spacing: FigmaLayoutTokens.text.spacing,
          alignment: FigmaLayoutTokens.text.alignment,
        },
      },
    };
  }

  /**
   * Получить метаданные Auto Layout для указанного типа контента.
   * Возвращает объект с параметрами padding, spacing, alignment,
   * соответствующими дизайн-токенам Figma.
   *
   * @param type - тип контента: 'photo', 'icon', 'text' или 'component'
   * @returns объект с параметрами Auto Layout
   */
  getFigmaMeta(type: string): FigmaLayoutMetadata {
    const layoutTokens = FigmaLayoutTokens[type as keyof typeof FigmaLayoutTokens];

    if (!layoutTokens) {
      // Возвращаем метаданные по умолчанию, если тип не найден
      return {
        padding: 0,
        spacing: 0,
        alignment: 'start',
      };
    }

    return {
      padding: layoutTokens.padding,
      spacing: layoutTokens.spacing,
      alignment: layoutTokens.alignment,
    };
  }
}

// ── Singleton instance ─────────────────────────────────────────────────────────

export const contentService = new ContentService();
