SPHINXBUILD ?= python -m sphinx
SOURCEDIR = source
BUILDDIR = build

.PHONY: html linkcheck clean

html:
	$(SPHINXBUILD) -W --keep-going -b html $(SOURCEDIR) $(BUILDDIR)/html

linkcheck:
	$(SPHINXBUILD) -W --keep-going -b linkcheck $(SOURCEDIR) $(BUILDDIR)/linkcheck

clean:
	rm -rf $(BUILDDIR)