---
permalink: /notes/
title: "笔记与习题"
description: "课程笔记、习题整理与学习资料。"
author_profile: true
redirect_from:
  - /notes-exercises/
---
{% assign data = site.data.site_content %}
{% include content/page-intro.html key="notes" %}
{% include content/section.html id="notes" title="全部内容" items=data.notes grouped=true %}
