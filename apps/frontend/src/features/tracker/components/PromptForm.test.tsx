import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PromptForm } from './PromptForm';

describe('PromptForm', () => {
  const onSubmit = vi.fn();

  beforeEach(() => {
    onSubmit.mockClear();
  });

  it('renders textarea and submit button', () => {
    render(<PromptForm onSubmit={onSubmit} isLoading={false} />);

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /开始分析 reddit/i })).toBeInTheDocument();
  });

  it('submit button is disabled when prompt is empty', () => {
    render(<PromptForm onSubmit={onSubmit} isLoading={false} />);

    const submitButton = screen.getByRole('button', { name: /开始分析 reddit/i });
    expect(submitButton).toBeDisabled();
  });

  it('submit button is disabled while loading', () => {
    render(<PromptForm onSubmit={onSubmit} isLoading={true} />);

    const submitButton = screen.getByRole('button', { name: /正在生成分析计划/i });
    expect(submitButton).toBeDisabled();
  });

  it('calls onSubmit with trimmed prompt', () => {
    render(<PromptForm onSubmit={onSubmit} isLoading={false} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '  hello world  ' } });

    const form = textarea.closest('form')!;
    fireEvent.submit(form);

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith('hello world', expect.anything());
  });

  it('does not call onSubmit when prompt is only whitespace', () => {
    render(<PromptForm onSubmit={onSubmit} isLoading={false} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '   ' } });

    const form = textarea.closest('form')!;
    fireEvent.submit(form);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('parses subreddits from comma-separated input and removes r/ prefix', () => {
    render(<PromptForm onSubmit={onSubmit} isLoading={false} />);

    fireEvent.click(screen.getByRole('button', { name: /高级选项/i }));

    const subredditsInput = screen.getByPlaceholderText(/programming, machineLearning, webdev/i);
    fireEvent.change(subredditsInput, {
      target: { value: 'r/Programming, WebDev' },
    });

    const textarea = screen.getByRole('textbox', {
      name: (_, el) => el.tagName === 'TEXTAREA',
    });
    fireEvent.change(textarea, { target: { value: 'test prompt' } });

    const form = textarea.closest('form')!;
    fireEvent.submit(form);

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith(
      'test prompt',
      expect.objectContaining({ subreddits: ['Programming', 'WebDev'] }),
    );
  });

  it('advanced options are hidden by default', () => {
    render(<PromptForm onSubmit={onSubmit} isLoading={false} />);

    expect(
      screen.queryByPlaceholderText(/programming, machineLearning, webdev/i),
    ).not.toBeInTheDocument();
  });

  it('closes advanced options when toggle is clicked a second time', () => {
    render(<PromptForm onSubmit={onSubmit} isLoading={false} />);

    const toggle = screen.getByRole('button', { name: /高级选项/i });
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(
      screen.queryByPlaceholderText(/programming, machineLearning, webdev/i),
    ).not.toBeInTheDocument();
  });

  it('parses a single subreddit correctly', () => {
    render(<PromptForm onSubmit={onSubmit} isLoading={false} />);

    fireEvent.click(screen.getByRole('button', { name: /高级选项/i }));

    const subredditsInput = screen.getByPlaceholderText(/programming, machineLearning, webdev/i);
    fireEvent.change(subredditsInput, { target: { value: 'javascript' } });

    const textarea = screen.getByRole('textbox', {
      name: (_, el) => el.tagName === 'TEXTAREA',
    });
    fireEvent.change(textarea, { target: { value: 'test prompt' } });
    fireEvent.submit(textarea.closest('form')!);

    expect(onSubmit).toHaveBeenCalledWith(
      'test prompt',
      expect.objectContaining({ subreddits: ['javascript'] }),
    );
  });

  it('filters empty entries from comma-separated subreddits input', () => {
    render(<PromptForm onSubmit={onSubmit} isLoading={false} />);

    fireEvent.click(screen.getByRole('button', { name: /高级选项/i }));

    const subredditsInput = screen.getByPlaceholderText(/programming, machineLearning, webdev/i);
    fireEvent.change(subredditsInput, { target: { value: ' ,programming, , webdev, ' } });

    const textarea = screen.getByRole('textbox', {
      name: (_, el) => el.tagName === 'TEXTAREA',
    });
    fireEvent.change(textarea, { target: { value: 'test prompt' } });
    fireEvent.submit(textarea.closest('form')!);

    expect(onSubmit).toHaveBeenCalledWith(
      'test prompt',
      expect.objectContaining({ subreddits: ['programming', 'webdev'] }),
    );
  });

  it('textarea is disabled when isLoading is true', () => {
    render(<PromptForm onSubmit={onSubmit} isLoading={true} />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeDisabled();
  });

  it('passes subreddits as undefined when no subreddits are entered', () => {
    render(<PromptForm onSubmit={onSubmit} isLoading={false} />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'test prompt' } });
    fireEvent.submit(textarea.closest('form')!);

    expect(onSubmit).toHaveBeenCalledWith(
      'test prompt',
      expect.objectContaining({ subreddits: undefined }),
    );
  });
});
