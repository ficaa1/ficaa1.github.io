---
title: Fish shell and tmux config files 
date: 2024-11-04
categories: []
tags: []     # TAG names should always be lowercase
---

# Fish shell config

```
if status is-interactive
    # Commands to run in interactive sessions can go here
    zoxide init --cmd cd fish | source
    fzf_configure_bindings --directory=\ct
    eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
end

# function fzf --wraps=fzf --description="Use fzf-tmux if in tmux session"
#   if set --query TMUX
#     fzf-tmux $argv
#   else
#     command fzf $argv
#   end
# end
abbr -a ga git add
abbr -a xsel xsel -i -b
abbr -a gr git rebase -i
abbr -a gpr git pull --rebase
abbr -a gp git push-for
abbr -a cdp cd ~/git/project
abbr -a gs git status --column
abbr -a gca git commit -a
abbr -a gc git commit
abbr -a gl git log --oneline
abbr -a b batcat
abbr -a gco git checkout
abbr -a g git
abbr -a bc batcat --style="header,rule"
abbr -a ansp ansible-playbook -i ansible/inventory.yml ansible/plays/pdt_push_config.yml --tags=product
abbr -a ansr ansible-playbook -i ansible/inventory.yml ansible/plays/pdt_restart.yml
abbr -a e eza -la --icons -snew
abbr -a et eza -la --icons -T -snew
abbr -a k kubectl
bind \e\cx cdi
set fzf_diff_highlighter delta --paging=never --width=20

```

# Lunarvim config

```

-- Read the docs: https://www.lunarvim.org/docs/configuration
-- Example configs: https://github.com/LunarVim/starter.lvim
-- Video Tutorials: https://www.youtube.com/watch?v=sFA9kX-Ud_c&list=PLhoH5vyxr6QqGu0i7tt_XoVK9v-KvZ3m6
-- Forum: https://www.reddit.com/r/lunarvim/
-- Discord: https://discord.com/invite/Xb9B4Ny
lvim.plugins = {
  {
  'wfxr/minimap.vim',
  build = "cargo install --locked code-minimap",
  -- cmd = {"Minimap", "MinimapClose", "MinimapToggle", "MinimapRefresh", "MinimapUpdateHighlight"},
  config = function ()
    vim.cmd ("let g:minimap_width = 10")
    vim.cmd ("let g:minimap_auto_start = 1")
    vim.cmd ("let g:minimap_auto_start_win_enter = 1")
  end,
  },
  {
  'cappyzawa/trim.nvim',
  config = function ()
    require("trim").setup({})
  end
  },
  {
  'tigion/nvim-asciidoc-preview',
  cmd = { 'AsciiDocPreview' },
  ft = { 'asciidoc' },
  build = 'cd server && npm install',
  opts = {
    -- Add user configuration here
  },
  }
}

vim.opt.shell = "/bin/bash"
-- add `pyright` to `skipped_servers` list
vim.list_extend(lvim.lsp.automatic_configuration.skipped_servers, { "pyright" })
-- remove `jedi_language_server` from `skipped_servers` list
lvim.lsp.automatic_configuration.skipped_servers = vim.tbl_filter(function(server)
  return server ~= "pylyzer"
end, lvim.lsp.automatic_configuration.skipped_servers)

```

# Tmux config

```

# Setup CWD when splitting
bind '"' split-window -c "#{pane_current_path}"
bind % split-window -h -c "#{pane_current_path}"
## Colors and scrolling
set -g default-terminal "screen-256color"
#set -ga terminal-overrides ",*-256color:Tc"
set -g @plugin 'noscript/tmux-mighty-scroll'
## Yank
set -g mouse on
#set -g @plugin 'tmux-plugins/tmux-yank'
#set -g @yank_selection_mouse 'clipboard'
#bind -T copy-mode-vi y send-keys -X copy-pipe-and-cancel 'xsel -i -b'
bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "xsel -i --clipboard"
#Ctrl+c to save tmux buffer to clipboard
bind C-c run "tmux save-buffer - | xsel -i -b"
setw -g mode-keys vi
bind P paste-buffer
bind-key [ copy-mode
bind-key ] paste-buffer
# Setup 'v' to begin selection as in Vim
bind-key -T copy-mode-vi v send -X begin-selection
bind-key -T copy-mode-vi y send -X copy-pipe-and-cancel "reattach-to-user-namespace pbcopy"
# Update default binding of `Enter` to also use copy-pipe
unbind -T copy-mode-vi Enter
bind-key -T copy-mode-vi Enter send -X copy-pipe-and-cancel "reattach-to-user-namespace pbcopy"

set -g @plugin 'tmux-plugins/tmux-resurrect'
#set -g @plugin 'tmux-plugins/tmux-sensible'
set -g @plugin 'jaclu/tmux-menus'
## Continuum
set -g @plugin 'tmux-plugins/tmux-continuum'
set -g @resurrect-capture-pane-contents 'on'
set -g status-right 'Continuum status: #{continuum_status}'
set -g @continuum-boot 'on'
set -g @continuum-save-interval '5'

set-option -g history-limit 50000
bind-key r source-file ~/.tmux.conf \; display-message "tmux.conf reloaded."
set -g @plugin 'laktak/extrakto'
set -g @extrakto_fzf_tool '/home/filip/.fzf/bin/fzf'

run '~/.tmux/plugins/tpm/tpm'

set -g default-command /bin/fish
set -g default-shell /bin/fish


```
