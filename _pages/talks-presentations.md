---
permalink: /talks/
title: "分享与讲座"
description: "公开分享、课程汇报与学术讲座记录。"
author_profile: true
redirect_from:
  - /talks-presentations/
---
{% assign data = site.data.site_content %}
{% include content/page-intro.html key="talks" %}
{% include content/section.html id="talks" title="全部分享" items=data.talks show_documents=true %}
