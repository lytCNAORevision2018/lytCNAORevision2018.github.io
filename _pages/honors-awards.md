---
permalink: /awards/
title: "荣誉与奖项"
description: "学习、科研、竞赛与社会实践相关荣誉。"
author_profile: true
redirect_from:
  - /honors-awards/
---
{% assign data = site.data.site_content %}
{% include content/page-intro.html key="awards" %}
{% include content/section.html id="awards" title="荣誉与奖项" items=data.awards %}
