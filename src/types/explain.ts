export type IndexMeta = {
  index_code: string;
  name: string;
  question: string;
  definition: string;
};

export type ExplainRequest = {
  indexA: string;
  indexB: string;
  country: string;
  execute?: boolean;
};

export type Correlation = {
  r: number;
  n?: number;
  method?: string;
  start_year?: number;
  end_year?: number;
};

export type ExplainResponse = {
  prompt: string;
  context: {
    indexA: IndexMeta;
    indexB: IndexMeta;
    country: string;
    correlation: {
      r: number;
      n?: number;
      method?: string;
      yearsCovered?: [number, number];
    } | null;
  };
  model: string;
  explanation?: string;
};
